from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from typing import Any
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.order_read import invalidate_orders_cache, _bound_in
from app.services.order_workflow import (
    execute_stock_command,
    stock_command_for_transition,
    validate_commercial_transition,
    validate_fulfillment_preconditions,
    validate_fulfillment_transition,
)
from app.services.pricing import calculate_quote_financials, resolve_deposit_rate_bps
from app.services.canonical_accounting import post_order_accounting
from app.services.payment import build_vietqr_image_url


class OrderConflictError(ValueError):
    """Raised when a caller tries to overwrite a newer order revision or accepts a stale quote."""


PAYMENT_PROOF_REVIEW_GRACE = timedelta(days=7)


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _as_utc(value: Any) -> datetime:
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


async def _bump_sync_revisions(db: AsyncSession, *, org_id: str, now: datetime) -> None:
    """Increment monotonic realtime sync counter for global scope and affected organization."""
    is_postgres = db.get_bind().dialect.name == "postgresql"
    try:
        await db.execute(
            text("""insert into order_sync_revisions (scope_type, scope_id, revision, updated_at)
                values ('global', 'global', 1, :now)
                on conflict (scope_type, scope_id)
                do update set revision = order_sync_revisions.revision + 1, updated_at = :now"""),
            {"now": now},
        )
        if org_id:
            await db.execute(
                text("""insert into order_sync_revisions (scope_type, scope_id, revision, updated_at)
                    values ('organization', :org_id, 1, :now)
                    on conflict (scope_type, scope_id)
                    do update set revision = order_sync_revisions.revision + 1, updated_at = :now"""),
                {"org_id": org_id, "now": now},
            )
    except Exception as exc:
        if is_postgres:
            raise exc


async def save_order(
    db: AsyncSession,
    *,
    actor_id: str,
    order: dict[str, Any],
    expected_updated_at: str | None = None,
) -> dict[str, str]:
    actor = (
        await db.execute(
            text("""select id, organization_id, full_name from app_users
                where id = :actor_id and status = 'active'"""),
            {"actor_id": actor_id},
        )
    ).mappings().first()
    if not actor or not actor["organization_id"]:
        raise ValueError("Tài khoản chưa gắn với tổ chức hoạt động.")

    order_id = str(order.get("id") or f"ord_{uuid.uuid4().hex}")
    existing = (
        await db.execute(text("select id from customer_orders where id = :id"), {"id": order_id})
    ).first()
    if existing:
        return await _update_order(
            db,
            actor_id=actor_id,
            order=order,
            expected_updated_at=expected_updated_at,
        )

    items = order.get("items") or []
    if not items:
        raise ValueError("Đơn hàng phải có ít nhất một sản phẩm.")

    # Concurrency check: Single active order per organization
    active_order = (
        await db.execute(
            text("""select id from customer_orders
                where organization_id = :organization_id
                  and commercial_status not in ('cancelled')
                  and fulfillment_status not in ('delivered')
                limit 1"""),
            {"organization_id": actor["organization_id"]},
        )
    ).first()
    if active_order:
        raise ValueError("Tổ chức đang có một đơn hàng hoạt động.")

    now = datetime.now(timezone.utc)
    order_number = f"PTW-{now:%y%m%d}-{uuid.uuid4().hex[:6].upper()}"
    payment_intent = str(order.get("paymentIntent") or "deposit_cod")
    if payment_intent not in {"deposit_cod", "pay_full"}:
        raise ValueError("Phương thức thanh toán không hợp lệ.")

    await db.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status,
             payment_status, fulfillment_status, payment_intent, invoice_requested,
             recipient_name, recipient_phone, recipient_address, customer_tax_code,
             customer_note, updated_at, created_at)
            values (:id, :order_number, :organization_id, :created_by, 'submitted',
                    'unrequested', 'not_started', :payment_intent, :invoice_requested,
                    :recipient_name, :recipient_phone, :recipient_address, :customer_tax_code,
                    :customer_note, :now, :now)"""),
        {
            "id": order_id,
            "order_number": order_number,
            "organization_id": actor["organization_id"],
            "created_by": actor_id,
            "payment_intent": payment_intent,
            "invoice_requested": bool(order.get("invoiceRequested", False)),
            "recipient_name": order.get("recipientName"),
            "recipient_phone": order.get("recipientPhone"),
            "recipient_address": order.get("recipientAddress"),
            "customer_tax_code": order.get("customerTaxCode"),
            "customer_note": order.get("customerNote"),
            "now": now,
        },
    )

    fulfillment_group_ids: dict[str, str] = {}
    persisted_items: list[dict[str, Any]] = []

    for index, item in enumerate(items):
        sku = str(item.get("variantSku") or "")
        supplier_id = str(item.get("supplierId") or "")
        quantity = int(item.get("quantity") or 0)
        catalog = (
            await db.execute(
                text("""select p.code, p.name, v.label, so.wholesale_price,
                    so.min_order_qty, so.stock_qty
                    from product_variants v
                    join products p on p.id = v.product_id and p.active = true
                    join supplier_offers so on so.product_variant_id = v.id and so.active = true
                    join suppliers s on s.id = so.supplier_id and s.active = true
                    where v.sku = :sku and v.active = true and so.supplier_id = :supplier_id
                    limit 1"""),
                {"sku": sku, "supplier_id": supplier_id},
            )
        ).mappings().first()
        if not catalog:
            raise ValueError(f"SKU {sku} không khả dụng từ nhà cung cấp đã chọn.")
        if quantity < int(catalog["min_order_qty"]) or quantity > int(catalog["stock_qty"]):
            raise ValueError(f"Số lượng SKU {sku} không đáp ứng MOQ hoặc tồn khả dụng.")

        item_id = str(item.get("id") or f"item_{uuid.uuid4().hex}_{index}")
        variant_image = str(item.get("variantImage") or "")
        unit_price = int(catalog["wholesale_price"])

        await db.execute(
            text("""insert into order_items
                (id, order_id, product_code_snapshot, product_name_snapshot,
                 variant_sku_snapshot, variant_label_snapshot, variant_image, supplier_id,
                 quantity, unit_price_snapshot, locked)
                values (:id, :order_id, :product_code, :product_name, :sku,
                        :variant_label, :variant_image, :supplier_id, :quantity, :unit_price, false)"""),
            {
                "id": item_id,
                "order_id": order_id,
                "product_code": catalog["code"],
                "product_name": catalog["name"],
                "sku": sku,
                "variant_label": catalog["label"],
                "variant_image": variant_image,
                "supplier_id": supplier_id,
                "quantity": quantity,
                "unit_price": unit_price,
            },
        )
        persisted_items.append({
            "id": item_id,
            "productCode": catalog["code"],
            "productName": catalog["name"],
            "variantSku": sku,
            "variantLabel": catalog["label"],
            "variantImage": variant_image,
            "supplierId": supplier_id,
            "quantity": quantity,
            "unitPriceSnapshot": unit_price,
        })

        group_id = fulfillment_group_ids.get(supplier_id)
        if group_id is None:
            group_id = f"fulfillment_{uuid.uuid4().hex}"
            fulfillment_group_ids[supplier_id] = group_id
            await db.execute(
                text("""insert into fulfillment_groups
                    (id, order_id, supplier_id, status, internal_note, updated_at)
                    values (:id, :order_id, :supplier_id, 'supplier_checking', '', :updated_at)"""),
                {
                    "id": group_id,
                    "order_id": order_id,
                    "supplier_id": supplier_id,
                    "updated_at": now,
                },
            )
        await db.execute(
            text("""insert into fulfillment_items (fulfillment_group_id, order_item_id)
                values (:group_id, :item_id)"""),
            {"group_id": group_id, "item_id": item_id},
        )

    for comment in order.get("comments") or []:
        await db.execute(
            text("""insert into order_comments
                (id, order_id, author_id, audience, message, created_at)
                values (:id, :order_id, :actor_id, 'customer_visible', :message, :created_at)"""),
            {
                "id": str(comment.get("id") or f"comment_{uuid.uuid4().hex}"),
                "order_id": order_id,
                "actor_id": actor_id,
                "message": str(comment.get("message") or "")[:2000],
                "created_at": now,
            },
        )

    actor_name = str(actor.get("full_name") or "Đại lý")
    is_postgres = db.get_bind().dialect.name == "postgresql"
    try:
        await db.execute(
            text("""insert into order_revision_history
                (id, order_id, revision_no, actor_id, actor_name, actor_role,
                 action_type, from_commercial_status, to_commercial_status,
                 items_snapshot, quote_snapshot, shipping_snapshot, note, created_at)
                values (:id, :order_id, 1, :actor_id, :actor_name, 'customer',
                        'submit_proposal', 'draft', 'submitted',
                        CAST(:items_snapshot AS jsonb), CAST(:quote_snapshot AS jsonb),
                        CAST(:shipping_snapshot AS jsonb), :note, :now)"""),
            {
                "id": f"rev_{uuid.uuid4().hex}",
                "order_id": order_id,
                "actor_id": actor_id,
                "actor_name": actor_name,
                "items_snapshot": json.dumps(persisted_items),
                "quote_snapshot": json.dumps([]),
                "shipping_snapshot": json.dumps({
                    "recipientName": order.get("recipientName") or "",
                    "recipientPhone": order.get("recipientPhone") or "",
                    "recipientAddress": order.get("recipientAddress") or "",
                    "customerTaxCode": order.get("customerTaxCode") or "",
                    "customerNote": order.get("customerNote") or "",
                }),
                "note": str(order.get("customerNote") or ""),
                "now": now,
            },
        )
    except Exception as exc:
        if is_postgres:
            raise exc

    await _bump_sync_revisions(db, org_id=actor["organization_id"], now=now)
    await db.commit()
    invalidate_orders_cache()
    return {"orderId": order_id, "orderNumber": order_number, "updatedAt": _iso(now) or ""}


async def reissue_payment_request(
    db: AsyncSession,
    *,
    actor_id: str,
    order_id: str,
) -> dict[str, Any]:
    """Idempotently issue a replacement request after an unpaid request expires or is rejected."""
    now = datetime.now(timezone.utc)
    is_postgres = db.get_bind().dialect.name == "postgresql"
    for_update = "for update of o" if is_postgres else ""
    order = (
        await db.execute(
            text(f"""select o.*, u.status as actor_status, u.full_name as actor_name
                from customer_orders o
                cross join app_users u
                where o.id = :order_id and u.id = :actor_id
                {for_update}"""),
            {"order_id": order_id, "actor_id": actor_id},
        )
    ).mappings().first()
    if not order:
        raise ValueError("Đơn hàng không tồn tại.")
    if str(order["actor_status"]) != "active":
        raise ValueError("Tài khoản không hoạt động.")

    role_keys = {
        str(row[0])
        for row in (
            await db.execute(
                text("""select r.key from user_roles ur join roles r on r.id = ur.role_id
                    where ur.user_id = :actor_id"""),
                {"actor_id": actor_id},
            )
        ).all()
    }
    permissions = {
        str(row[0])
        for row in (
            await db.execute(
                text("""select distinct rp.permission_key from user_roles ur
                    join role_permissions rp on rp.role_id = ur.role_id
                    where ur.user_id = :actor_id"""),
                {"actor_id": actor_id},
            )
        ).all()
    }
    if "order.confirm_payment" not in permissions and "super_admin" not in role_keys:
        raise ValueError("Tài khoản không có quyền phát hành lại yêu cầu thanh toán.")
    if str(order["commercial_status"]) not in {"customer_accepted", "locked"}:
        raise ValueError("PAYMENT_REQUEST_REISSUE_INVALID_ORDER: Đơn hàng chưa chốt báo giá.")

    payment_status = str(order["payment_status"])
    if payment_status == "cod_remaining":
        purpose = "remaining"
        if str(order["payment_intent"]) != "deposit_cod" or str(order["fulfillment_status"]) != "delivered":
            raise ValueError("PAYMENT_REQUEST_REISSUE_INVALID_ORDER: Đơn COD chưa hoàn tất giao hàng.")
    elif payment_status in {"deposit_requested", "deposit_uploaded"}:
        purpose = "deposit"
    elif payment_status in {"full_requested", "full_uploaded"}:
        purpose = "full"
    else:
        raise ValueError("PAYMENT_REQUEST_REISSUE_INVALID_STATUS: Đơn hàng không chờ yêu cầu thanh toán thay thế.")

    request_rows = (
        await db.execute(
            text("""select pr.id, pr.amount, pr.reference, pr.qr_payload, pr.status, pr.expires_at,
                    exists(select 1 from payment_proofs pp where pp.payment_request_id = pr.id
                        and pp.status = 'pending_admin_confirmation') as has_pending_proof
                from payment_requests pr
                where pr.order_id = :order_id and pr.purpose = :purpose
                order by pr.expires_at desc, pr.id desc"""),
            {"order_id": order_id, "purpose": purpose},
        )
    ).mappings().all()
    if any(
        str(request_row["status"]) == "uploaded" and bool(request_row["has_pending_proof"])
        for request_row in request_rows
    ):
        raise ValueError(
            "PAYMENT_PROOF_PENDING_REVIEW: Đơn hàng đang có minh chứng chờ duyệt; không được phát hành yêu cầu trùng."
        )
    for request_row in request_rows:
        status = str(request_row["status"])
        expires_at = _as_utc(request_row["expires_at"])
        if status == "active" and expires_at > now:
            return {
                "id": str(request_row["id"]),
                "purpose": purpose,
                "amount": int(request_row["amount"]),
                "reference": str(request_row["reference"]),
                "qrPayload": str(request_row["qr_payload"]),
                "status": "active",
                "expiresAt": _iso(request_row["expires_at"]),
                "reissued": False,
            }

    accepted_quote = (
        await db.execute(
            text("""select id, final_total, deposit_amount, cod_remaining
                from quote_versions where order_id = :order_id and status = 'accepted'
                order by version desc, created_at desc, id desc limit 1"""),
            {"order_id": order_id},
        )
    ).mappings().first()
    if not accepted_quote:
        raise ValueError("PAYMENT_REQUEST_REISSUE_NO_QUOTE: Không tìm thấy báo giá đã chấp thuận.")
    amount_field = {"deposit": "deposit_amount", "full": "final_total", "remaining": "cod_remaining"}[purpose]
    amount = int(accepted_quote[amount_field] or 0)
    if amount <= 0:
        raise ValueError("PAYMENT_REQUEST_REISSUE_INVALID_AMOUNT: Số tiền thanh toán không hợp lệ.")

    await db.execute(
        text("""update payment_requests set status = 'superseded'
            where order_id = :order_id and purpose = :purpose and status in ('active', 'uploaded')"""),
        {"order_id": order_id, "purpose": purpose},
    )
    clean_order_num = str(order["order_number"]).upper().removeprefix("PTW-")
    clean_order_num = "".join(ch for ch in clean_order_num if ch.isalnum() or ch in "-_")[:32]
    reference = f"PTW-{clean_order_num}-{purpose[:3].upper()}-{uuid.uuid4().hex[:8].upper()}"
    expires_at = now + timedelta(days=7 if purpose == "remaining" else 3)
    request_id = f"pr_{uuid.uuid4().hex}"
    qr_payload = build_vietqr_image_url(amount_vnd=amount, reference=reference)
    await db.execute(
        text("""insert into payment_requests
            (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
            values (:id, :order_id, :quote_id, :purpose, :amount, :reference,
                    :qr_payload, 'active', :expires_at)"""),
        {
            "id": request_id,
            "order_id": order_id,
            "quote_id": accepted_quote["id"],
            "purpose": purpose,
            "amount": amount,
            "reference": reference,
            "qr_payload": qr_payload,
            "expires_at": expires_at,
        },
    )
    await db.execute(
        text("update customer_orders set updated_at = :now where id = :order_id"),
        {"now": now, "order_id": order_id},
    )
    await db.execute(
        text("""insert into order_comments
            (id, order_id, author_id, audience, message, created_at)
            values (:id, :order_id, :actor_id, 'customer_visible', :message, :created_at)"""),
        {
            "id": f"comment_{uuid.uuid4().hex}",
            "order_id": order_id,
            "actor_id": actor_id,
            "message": "Yêu cầu thanh toán đã được phát hành lại. Vui lòng dùng đúng mã tham chiếu mới hiển thị trên đơn hàng.",
            "created_at": now,
        },
    )
    if is_postgres:
        next_revision = int((await db.execute(
            text("select coalesce(max(revision_no), 0) + 1 from order_revision_history where order_id = :order_id"),
            {"order_id": order_id},
        )).scalar_one())
        items_snapshot = (
            await db.execute(
                text("""select id, product_code_snapshot as "productCode",
                    product_name_snapshot as "productName", variant_sku_snapshot as "variantSku",
                    variant_label_snapshot as "variantLabel", quantity,
                    unit_price_snapshot as "unitPriceSnapshot", locked
                    from order_items where order_id = :order_id order by id"""),
                {"order_id": order_id},
            )
        ).mappings().all()
        quotes_snapshot = (
            await db.execute(
                text("""select id, version, status, subtotal, final_total as "finalTotal",
                    deposit_amount as "depositAmount", cod_remaining as "codRemaining",
                    expires_at as "expiresAt"
                    from quote_versions where order_id = :order_id order by version"""),
                {"order_id": order_id},
            )
        ).mappings().all()
        await db.execute(
            text("""insert into order_revision_history
                (id, order_id, revision_no, actor_id, actor_name, actor_role, action_type,
                 from_commercial_status, to_commercial_status, items_snapshot, quote_snapshot,
                 shipping_snapshot, note, created_at)
                values (:id, :order_id, :revision_no, :actor_id, :actor_name, 'admin',
                        'reissue_payment_request', :commercial_status, :commercial_status,
                        CAST(:items_snapshot AS jsonb), CAST(:quote_snapshot AS jsonb),
                        CAST(:shipping_snapshot AS jsonb), :note, :created_at)"""),
            {
                "id": f"rev_{uuid.uuid4().hex}",
                "order_id": order_id,
                "revision_no": next_revision,
                "actor_id": actor_id,
                "actor_name": str(order["actor_name"]),
                "commercial_status": str(order["commercial_status"]),
                "items_snapshot": json.dumps([dict(row) for row in items_snapshot], default=str),
                "quote_snapshot": json.dumps([dict(row) for row in quotes_snapshot], default=str),
                "shipping_snapshot": json.dumps({
                    "recipientName": order["recipient_name"] or "",
                    "recipientPhone": order["recipient_phone"] or "",
                    "recipientAddress": order["recipient_address"] or "",
                    "customerTaxCode": order["customer_tax_code"] or "",
                    "customerNote": order["customer_note"] or "",
                }),
                "note": f"Reissued authoritative {purpose} payment request {request_id}.",
                "created_at": now,
            },
        )
    await _bump_sync_revisions(db, org_id=str(order["organization_id"]), now=now)
    await db.commit()
    invalidate_orders_cache()
    return {
        "id": request_id,
        "purpose": purpose,
        "amount": amount,
        "reference": reference,
        "qrPayload": qr_payload,
        "status": "active",
        "expiresAt": _iso(expires_at),
        "reissued": True,
    }


async def _update_order(
    db: AsyncSession,
    *,
    actor_id: str,
    order: dict[str, Any],
    expected_updated_at: str | None,
) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    order_id = str(order["id"])
    is_postgres = db.get_bind().dialect.name == "postgresql"

    # 1. Early Row Lock on Order Entity to Serialize Concurrent Updates
    for_update = "for update of o" if is_postgres else ""
    current = (
        await db.execute(
            text(f"""select o.*, u.organization_id as actor_org
                from customer_orders o
                cross join app_users u
                where o.id = :order_id and u.id = :actor_id and u.status = 'active'
                {for_update}"""),
            {"order_id": order_id, "actor_id": actor_id},
        )
    ).mappings().first()
    if not current:
        raise ValueError("Đơn hàng không tồn tại.")

    # 2. Concurrency CAS check (under row lock)
    if expected_updated_at is not None and _as_utc(current["updated_at"]) != _as_utc(expected_updated_at):
        raise OrderConflictError(
            "Đơn hàng đã được cập nhật bởi phiên làm việc khác. Hãy tải lại dữ liệu trước khi lưu."
        )

    internal = (
        await db.execute(
            text("""select 1 from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = :actor_id and r.key in
                    ('super_admin', 'admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse', 'sales_staff') limit 1"""),
            {"actor_id": actor_id},
        )
    ).first()
    if not internal and current["organization_id"] != current["actor_org"]:
        raise ValueError("Không có quyền cập nhật đơn hàng này.")

    permission_rows = (
        await db.execute(
            text("""select distinct rp.permission_key from user_roles ur
                join role_permissions rp on rp.role_id = ur.role_id
                where ur.user_id = :actor_id"""),
            {"actor_id": actor_id},
        )
    ).all()
    permissions = {str(row[0]) for row in permission_rows}
    actor_role_keys = {
        str(row[0])
        for row in (
            await db.execute(
                text("""select r.key from user_roles ur join roles r on r.id = ur.role_id
                    where ur.user_id = :actor_id"""),
                {"actor_id": actor_id},
            )
        ).all()
    }

    if not internal:
        if "items" in order:
            raise ValueError("CUSTOMER_ITEM_MUTATION_FORBIDDEN: Đại lý không được chỉnh sửa danh sách sản phẩm sau khi đơn đã tạo.")
        if "quoteVersions" in order:
            raise ValueError("CUSTOMER_QUOTE_MUTATION_FORBIDDEN: Đại lý không được chỉnh sửa phiên bản báo giá.")
        if "fulfillmentGroups" in order or "shipment" in order or "fulfillmentStatus" in order:
            raise ValueError("CUSTOMER_FULFILLMENT_MUTATION_FORBIDDEN: Đại lý không được chỉnh sửa thông tin giao vận.")
        if "paymentRequests" in order:
            raise ValueError("CUSTOMER_PAYMENT_REQUEST_MUTATION_FORBIDDEN: Đại lý không được chỉnh sửa yêu cầu thanh toán.")
        if "assignedStaffId" in order or "assignedStaffName" in order:
            raise ValueError("CUSTOMER_ASSIGNED_STAFF_MUTATION_FORBIDDEN: Đại lý không được tự gán nhân viên xử lý.")
        if "paymentStatus" in order:
            raise ValueError("CUSTOMER_PAYMENT_STATUS_MUTATION_FORBIDDEN: Đại lý không được tự ý thiết lập trạng thái thanh toán.")
        locked_customer_fields = {
            "paymentIntent": "payment_intent",
            "invoiceRequested": "invoice_requested",
            "recipientName": "recipient_name",
            "recipientPhone": "recipient_phone",
            "recipientAddress": "recipient_address",
            "customerTaxCode": "customer_tax_code",
        }
        has_locked_customer_change = any(
            field in order and order[field] != current[column]
            for field, column in locked_customer_fields.items()
        )
        customer_details_are_locked = (
            str(current["commercial_status"]) in {"customer_accepted", "locked", "cancelled"}
            or str(current["fulfillment_status"]) != "not_started"
        )
        if has_locked_customer_change and customer_details_are_locked:
            raise ValueError(
                "CUSTOMER_ORDER_DETAILS_LOCKED: Thông tin thanh toán, hóa đơn và giao nhận đã khóa sau khi chấp thuận báo giá."
            )

    if internal:
        permission_changes = {
            "order.quote": (
                order.get("commercialStatus", current["commercial_status"]) != current["commercial_status"]
                or order.get("assignedStaffId", current["assigned_staff_id"]) != current["assigned_staff_id"]
                or order.get("items") is not None
                or order.get("quoteVersions") is not None
            ),
            "order.confirm_payment": (
                order.get("paymentStatus", current["payment_status"]) != current["payment_status"]
            ),
            "order.ship": (
                order.get("fulfillmentStatus", current["fulfillment_status"]) != current["fulfillment_status"]
                or order.get("fulfillmentGroups") is not None
                or order.get("shipment") is not None
            ),
        }
        for required_permission, has_changes in permission_changes.items():
            if has_changes and required_permission not in permissions and "super_admin" not in actor_role_keys:
                raise ValueError(f"Tài khoản thiếu quyền nghiệp vụ {required_permission}.")

    # 3. Canonical State Machine Validation
    requested_commercial_status = order.get("commercialStatus", current["commercial_status"])
    validate_commercial_transition(
        actor_is_internal=bool(internal),
        permissions=permissions,
        before=str(current["commercial_status"]),
        after=str(requested_commercial_status),
    )

    if requested_commercial_status == "cancelled":
        if current["payment_status"] in {"deposit_confirmed", "paid", "refunded"}:
            raise ValueError("LOCKED_ORDER_CANCELLATION_REQUIRES_REVERSAL_WORKFLOW: Đơn hàng đã có thanh toán được xác nhận. Hủy đơn yêu cầu quy trình hoàn tiền và đảo sổ riêng biệt.")
        await db.execute(
            text("update payment_requests set status = 'superseded' where order_id = :order_id and status in ('active', 'uploaded')"),
            {"order_id": order_id},
        )

    if order.get("fulfillmentStatus") is not None:
        validate_fulfillment_preconditions(
            commercial_status=str(current["commercial_status"]),
            payment_status=str(current["payment_status"]),
            before=str(current["fulfillment_status"]),
            after=str(order["fulfillmentStatus"]),
            has_shipment=bool(order.get("shipment")),
        )
        validate_fulfillment_transition(
            before=str(current["fulfillment_status"]),
            after=str(order["fulfillmentStatus"]),
        )

    is_accepting_quote = requested_commercial_status == "customer_accepted" and current["commercial_status"] != "customer_accepted"
    is_requesting_changes = requested_commercial_status == "admin_review" and current["commercial_status"] == "quoted"
    accepted_quote_row: dict[str, Any] | None = None
    next_commercial_status = requested_commercial_status

    # 4. Handle Customer Acceptance (Exact Identity + Atomic Persist + Immutability)
    if is_accepting_quote:
        target_quote_id = order.get("acceptedQuoteId")
        target_quote_version = order.get("acceptedQuoteVersion")

        if not target_quote_id or target_quote_version is None:
            raise OrderConflictError("Thiếu thông tin nhận diện báo giá cần chấp thuận (yêu cầu cả acceptedQuoteId và acceptedQuoteVersion).")

        quote_for_update = "for update" if is_postgres else ""
        quote_query = f"""select * from quote_versions
            where id = :quote_id
              and order_id = :order_id
              and version = :version
              and status = 'published' {quote_for_update}"""
        quote_params: dict[str, Any] = {
            "quote_id": str(target_quote_id),
            "order_id": order_id,
            "version": int(target_quote_version),
        }

        db_quote = (await db.execute(text(quote_query), quote_params)).mappings().first()
        if not db_quote:
            raise OrderConflictError("Báo giá không tồn tại, đã thay đổi, bị hủy hoặc đã hết hiệu lực. (QUOTE_STALE_OR_INVALID)")

        # Verify current quote version
        if int(db_quote["version"]) != int(current["current_quote_version"] or 0):
            raise OrderConflictError("Báo giá không phải là phiên bản hiện hành mới nhất. (QUOTE_STALE)")

        # Check expiry
        quote_expires_at = _as_utc(db_quote["expires_at"])
        if quote_expires_at <= now:
            raise OrderConflictError("Báo giá đã hết hạn. Vui lòng gửi yêu cầu để nhân viên báo giá lại. (QUOTE_EXPIRED)")

        # Verify adjustment approvals
        unapproved_adj = (
            await db.execute(
                text("""select count(*) from quote_adjustments
                    where quote_id = :quote_id and requires_approval = true and approved_by is null"""),
                {"quote_id": db_quote["id"]},
            )
        ).scalar()
        if unapproved_adj and int(unapproved_adj) > 0:
            raise OrderConflictError("Báo giá có điều chỉnh đặc biệt chưa được phê duyệt. (QUOTE_APPROVAL_REQUIRED)")

        accepted_quote_row = dict(db_quote)

        # Atomic quote transition: published -> accepted
        await db.execute(
            text("""update quote_versions
                set status = 'accepted', accepted_by = :actor_id, accepted_at = :now
                where id = :quote_id"""),
            {"quote_id": db_quote["id"], "actor_id": actor_id, "now": now},
        )

        # Supersede any other published quotes of this order
        await db.execute(
            text("""update quote_versions
                set status = 'superseded'
                where order_id = :order_id and id <> :quote_id and status = 'published'"""),
            {"order_id": order_id, "quote_id": db_quote["id"]},
        )

        # Lock order items
        await db.execute(
            text("update order_items set locked = true where order_id = :order_id"),
            {"order_id": order_id},
        )

        # Update order current quote version
        await db.execute(
            text("update customer_orders set current_quote_version = :version where id = :id"),
            {"version": int(db_quote["version"]), "id": order_id},
        )

    # 5. Guard & Canonicalize Order Items (Canonicalize BEFORE Quote Calculation)
    locked_items_count = (
        await db.execute(
            text("select count(*) from order_items where order_id = :order_id and locked = true"),
            {"order_id": order_id},
        )
    ).scalar()

    if order.get("items") is not None:
        if locked_items_count and int(locked_items_count) > 0:
            raise ValueError("Không thể chỉnh sửa danh sách sản phẩm của đơn hàng đã khóa báo giá thương mại. (LOCKED_ITEM_IMMUTABLE)")

        incoming_items = order["items"]
        if not incoming_items:
            raise ValueError("Đơn hàng phải có ít nhất một sản phẩm.")

        existing_items_rows = (
            await db.execute(
                text("select id from order_items where order_id = :order_id"),
                {"order_id": order_id},
            )
        ).scalars().all()
        existing_item_ids = set(existing_items_rows)
        incoming_item_ids = {str(item.get("id")) for item in incoming_items if item.get("id")}

        to_delete = existing_item_ids - incoming_item_ids
        if to_delete:
            del_filter, del_params = _bound_in("order_item_id", to_delete, "del_item")
            await db.execute(text(f"delete from fulfillment_items where {del_filter}"), del_params)
            del_filter_oi, del_params_oi = _bound_in("id", to_delete, "del_oi")
            await db.execute(
                text(f"delete from order_items where {del_filter_oi} and order_id = :order_id"),
                {**del_params_oi, "order_id": order_id},
            )

        for index, item in enumerate(incoming_items):
            item_id = str(item.get("id") or f"item_{uuid.uuid4().hex}_{index}")
            sku = str(item.get("variantSku") or item.get("sku") or "")
            supplier_id = str(item.get("supplierId") or item.get("supplier_id") or "sup_pettravel")
            quantity = int(item.get("quantity") or 1)

            # Authoritative pricing lookup (Fail-closed, no fallback to client unitPriceSnapshot)
            catalog_row = (
                await db.execute(
                    text("""select p.code, p.name, v.label, v.image_url as variant_image,
                                so.wholesale_price, so.min_order_qty, so.stock_qty
                            from product_variants v
                            join products p on p.id = v.product_id
                            join supplier_offers so on so.product_variant_id = v.id
                            join suppliers s on s.id = so.supplier_id
                            where v.sku = :sku
                              and v.active = true
                              and p.active = true
                              and so.supplier_id = :supplier_id
                              and so.active = true
                              and s.active = true
                            limit 1"""),
                    {"sku": sku, "supplier_id": supplier_id},
                )
            ).mappings().first()

            if not catalog_row:
                raise ValueError(f"SKU_OR_SUPPLIER_INVALID: Sản phẩm ({sku}) hoặc nhà cung cấp ({supplier_id}) không hợp lệ hoặc đã ngừng hoạt động.")

            min_order_qty = int(catalog_row.get("min_order_qty") or 1)
            if not internal and quantity < min_order_qty:
                raise ValueError(f"MOQ_NOT_MET: Số lượng ({quantity}) nhỏ hơn số lượng tối thiểu ({min_order_qty}) của phân loại {sku}.")

            unit_price = int(catalog_row["wholesale_price"])
            product_code = str(catalog_row["code"])
            product_name = str(catalog_row["name"])
            variant_label = str(catalog_row["label"] or sku)
            variant_image = str(catalog_row["variant_image"] or item.get("variantImage") or "")

            if item_id in existing_item_ids:
                await db.execute(
                    text("""update order_items set
                        quantity = :quantity,
                        unit_price_snapshot = :unit_price,
                        product_code_snapshot = :product_code,
                        product_name_snapshot = :product_name,
                        variant_sku_snapshot = :sku,
                        variant_label_snapshot = :variant_label,
                        variant_image = :variant_image,
                        supplier_id = :supplier_id
                        where id = :id and order_id = :order_id"""),
                    {
                        "id": item_id,
                        "order_id": order_id,
                        "quantity": quantity,
                        "unit_price": unit_price,
                        "product_code": product_code,
                        "product_name": product_name,
                        "sku": sku,
                        "variant_label": variant_label,
                        "variant_image": variant_image,
                        "supplier_id": supplier_id,
                    },
                )
            else:
                await db.execute(
                    text("""insert into order_items
                        (id, order_id, product_code_snapshot, product_name_snapshot,
                         variant_sku_snapshot, variant_label_snapshot, variant_image,
                         supplier_id, quantity, unit_price_snapshot, locked)
                        values (:id, :order_id, :product_code, :product_name,
                                :sku, :variant_label, :variant_image, :supplier_id,
                                :quantity, :unit_price, false)"""),
                    {
                        "id": item_id,
                        "order_id": order_id,
                        "product_code": product_code,
                        "product_name": product_name,
                        "sku": sku,
                        "variant_label": variant_label,
                        "variant_image": variant_image,
                        "supplier_id": supplier_id,
                        "quantity": quantity,
                        "unit_price": unit_price,
                    },
                )
                group_id = (
                    await db.execute(
                        text("select id from fulfillment_groups where order_id = :order_id and supplier_id = :supplier_id limit 1"),
                        {"order_id": order_id, "supplier_id": supplier_id},
                    )
                ).scalar()
                if not group_id:
                    group_id = f"fulfillment_{uuid.uuid4().hex}"
                    await db.execute(
                        text("""insert into fulfillment_groups (id, order_id, supplier_id, status, internal_note, updated_at)
                            values (:id, :order_id, :supplier_id, 'supplier_checking', '', :now)"""),
                        {"id": group_id, "order_id": order_id, "supplier_id": supplier_id, "now": now},
                    )
                await db.execute(
                    text("""insert into fulfillment_items (fulfillment_group_id, order_item_id)
                        values (:group_id, :item_id) on conflict do nothing"""),
                    {"group_id": group_id, "item_id": item_id},
                )

    # 6. Handle Admin Quote Publishing & Editing
    if internal and order.get("quoteVersions") is not None:
        if "order.quote" not in permissions and "super_admin" not in actor_role_keys:
            raise ValueError("Tài khoản không có quyền xuất bản báo giá.")

        highest_version = int(current["current_quote_version"] or 0)
        canonical_items = (
            await db.execute(
                text("select quantity, unit_price_snapshot from order_items where order_id = :order_id"),
                {"order_id": order_id},
            )
        ).mappings().all()

        deposit_rate_bps = await resolve_deposit_rate_bps(db, default_bps=3000)

        for quote in order.get("quoteVersions") or []:
            quote_status = str(quote.get("status") or "published")
            if quote_status == "accepted":
                raise ValueError("ADMIN_CANNOT_ACCEPT_QUOTE: Quản trị viên không thể tạo hoặc đặt trạng thái báo giá là accepted trực tiếp.")

            quote_id = str(quote.get("id") or f"quote_{uuid.uuid4().hex}")
            version = int(quote.get("version") or 0)
            if version <= 0:
                raise ValueError("Phiên bản báo giá không hợp lệ.")
            highest_version = max(highest_version, version)

            adjustments = quote.get("adjustments") or []
            requires_manager_approval = any(bool(adj.get("requiresApproval")) for adj in adjustments)
            if (
                quote_status == "published"
                and requires_manager_approval
                and not actor_role_keys.intersection({"super_admin", "admin_manager"})
            ):
                raise ValueError("Báo giá có điều chỉnh đặc biệt phải được quản lý phê duyệt trước khi phát hành.")

            # Authoritative Server-Side Calculation using canonical DB items
            intent = str(order.get("paymentIntent") or current["payment_intent"])
            calc = calculate_quote_financials(
                items=canonical_items,
                adjustments=adjustments,
                payment_intent=intent,
                deposit_rate_bps=deposit_rate_bps,
            )

            expires_at = quote.get("expiresAt")
            if isinstance(expires_at, str):
                expires_at_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            else:
                expires_at_dt = now + timedelta(days=3)

            quote_exists = (
                await db.execute(
                    text("select id, status from quote_versions where id = :id and order_id = :order_id"),
                    {"id": quote_id, "order_id": order_id},
                )
            ).mappings().first()

            quote_values = {
                "id": quote_id,
                "order_id": order_id,
                "version": version,
                "status": quote_status,
                "subtotal": calc["subtotal"],
                "final_total": calc["finalTotal"],
                "deposit_amount": calc["depositAmount"],
                "cod_remaining": calc["codRemaining"],
                "expires_at": expires_at_dt,
                "actor_id": actor_id,
                "now": now,
            }

            if quote_exists:
                if quote_exists["status"] == "accepted":
                    raise ValueError("Không thể thay đổi trạng thái của báo giá đã được đại lý chấp thuận. (ACCEPTED_QUOTE_IMMUTABLE)")
                await db.execute(
                    text("""update quote_versions set
                        status = :status, subtotal = :subtotal, final_total = :final_total,
                        deposit_amount = :deposit_amount, cod_remaining = :cod_remaining,
                        expires_at = :expires_at
                        where id = :id and order_id = :order_id"""),
                    quote_values,
                )
            else:
                await db.execute(
                    text("""insert into quote_versions
                        (id, order_id, version, status, subtotal, final_total,
                         deposit_amount, cod_remaining, expires_at, published_by, created_at)
                        values (:id, :order_id, :version, :status, :subtotal, :final_total,
                                :deposit_amount, :cod_remaining, :expires_at, :actor_id, :now)"""),
                    quote_values,
                )

            existing_adjustments = {
                str(row[0])
                for row in (
                    await db.execute(
                        text("select id from quote_adjustments where quote_id = :quote_id"),
                        {"quote_id": quote_id},
                    )
                ).all()
            }
            for adjustment in adjustments:
                adj_id = str(adjustment.get("id") or f"adjustment_{uuid.uuid4().hex}")
                if adj_id in existing_adjustments:
                    continue
                if "order.adjust" not in permissions and "super_admin" not in actor_role_keys:
                    raise ValueError("Tài khoản không có quyền thêm điều chỉnh báo giá.")
                await db.execute(
                    text("""insert into quote_adjustments
                        (id, quote_id, type, label, amount, requires_approval, approved_by)
                        values (:id, :quote_id, :type, :label, :amount, :requires_approval, :approved_by)"""),
                    {
                        "id": adj_id,
                        "quote_id": quote_id,
                        "type": str(adjustment.get("type") or "discount"),
                        "label": str(adjustment.get("label") or adjustment.get("name") or "Chiết khấu"),
                        "amount": int(adjustment.get("amount") or 0),
                        "requires_approval": bool(adjustment.get("requiresApproval", False)),
                        "approved_by": (
                            actor_id
                            if bool(adjustment.get("requiresApproval", False))
                            and actor_role_keys.intersection({"super_admin", "admin_manager"})
                            else None
                        ),
                    },
                )

        await db.execute(
            text("update customer_orders set current_quote_version = :version where id = :id"),
            {"version": highest_version, "id": order_id},
        )


    # 7. Update Fulfillment Groups & Shipments if Admin
    if internal and order.get("fulfillmentGroups") is not None:
        allowed_fulfillment_statuses = {
            "not_started", "supplier_checking", "supplier_confirmed",
            "packing", "ready_to_ship", "shipped", "delivered"
        }
        for group in order.get("fulfillmentGroups") or []:
            status = str(group.get("status") or "")
            if status not in allowed_fulfillment_statuses:
                raise ValueError("Trạng thái xử lý nhà cung cấp không hợp lệ.")
            result = await db.execute(
                text("""update fulfillment_groups
                    set status = :status, internal_note = :internal_note, updated_at = :updated_at
                    where id = :id and order_id = :order_id and supplier_id = :supplier_id"""),
                {
                    "id": str(group.get("id") or ""),
                    "order_id": order_id,
                    "supplier_id": str(group.get("supplierId") or ""),
                    "status": status,
                    "internal_note": str(group.get("internalNote") or "")[:2000],
                    "updated_at": now,
                },
            )
            if result.rowcount != 1:
                raise ValueError("Nhóm xử lý nhà cung cấp không thuộc đơn hàng.")

    if internal and order.get("shipment") is not None:
        shipment = order["shipment"]
        carrier = str(shipment.get("carrier") or "").strip()
        tracking_code = str(shipment.get("trackingCode") or "").strip()
        shipping_fee = int(shipment.get("shippingFee") or 0)
        if not carrier or not tracking_code or shipping_fee < 0:
            raise ValueError("Thông tin vận chuyển không hợp lệ.")
        existing_shipment = (
            await db.execute(
                text("select id from shipments where order_id = :order_id order by created_at desc, id desc limit 1"),
                {"order_id": order_id},
            )
        ).scalar()
        shipment_values = {
            "id": existing_shipment or f"shipment_{uuid.uuid4().hex}",
            "order_id": order_id,
            "carrier": carrier[:160],
            "tracking_code": tracking_code[:160],
            "shipping_fee": shipping_fee,
            "eta": str(shipment.get("eta") or "")[:80] or None,
            "note": str(shipment.get("note") or "")[:2000],
            "actor_id": actor_id,
            "created_at": now,
        }
        if existing_shipment:
            await db.execute(
                text("""update shipments set carrier = :carrier, tracking_code = :tracking_code,
                    shipping_fee = :shipping_fee, eta = :eta, note = :note
                    where id = :id and order_id = :order_id"""),
                shipment_values,
            )
        else:
            await db.execute(
                text("""insert into shipments
                    (id, order_id, carrier, tracking_code, shipping_fee, eta, note, created_by, created_at)
                    values (:id, :order_id, :carrier, :tracking_code, :shipping_fee, :eta,
                            :note, :actor_id, :created_at)"""),
                shipment_values,
            )

    # 8. Server-Derived Payment Request Generation on Acceptance
    if is_accepting_quote and accepted_quote_row:
        intent = str(order.get("paymentIntent") or current["payment_intent"])
        purpose = "full" if intent == "pay_full" else "deposit"
        expected_amount = int(accepted_quote_row["final_total"] if purpose == "full" else accepted_quote_row["deposit_amount"])

        await db.execute(
            text("update payment_requests set status = 'superseded' where order_id = :order_id and status = 'active'"),
            {"order_id": order_id},
        )

        ref_suffix = uuid.uuid4().hex[:4].upper()
        clean_order_num = str(current["order_number"]).replace("PTW-", "").replace("-", "")
        ref_code = f"PTW-{clean_order_num}-{purpose[:3].upper()}-{ref_suffix}"
        pr_id = f"pr_{uuid.uuid4().hex}"
        qr_payload = build_vietqr_image_url(amount_vnd=expected_amount, reference=ref_code)

        await db.execute(
            text("""insert into payment_requests
                (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
                values (:id, :order_id, :quote_id, :purpose, :amount, :reference,
                        :qr_payload, 'active', :expires_at)"""),
            {
                "id": pr_id,
                "order_id": order_id,
                "quote_id": accepted_quote_row["id"],
                "purpose": purpose,
                "amount": expected_amount,
                "reference": ref_code,
                "qr_payload": qr_payload,
                "expires_at": now + timedelta(days=3),
            },
        )

    is_marking_delivered = (
        internal
        and str(order.get("fulfillmentStatus") or current["fulfillment_status"]) == "delivered"
        and str(current["fulfillment_status"]) != "delivered"
    )
    if (
        is_marking_delivered
        and str(current["payment_intent"]) == "deposit_cod"
        and str(current["payment_status"]) == "deposit_confirmed"
    ):
        remaining_quote = (
            await db.execute(
                text("""select id, cod_remaining from quote_versions
                    where order_id = :order_id and status = 'accepted'
                    order by version desc, created_at desc, id desc limit 1"""),
                {"order_id": order_id},
            )
        ).mappings().first()
        remaining_amount = int(remaining_quote["cod_remaining"] or 0) if remaining_quote else 0
        if not remaining_quote or remaining_amount <= 0:
            raise ValueError("COD_REMAINING_AMOUNT_INVALID: Không tìm thấy số tiền COD còn lại hợp lệ.")

        clean_order_num = str(current["order_number"]).upper().removeprefix("PTW-")
        clean_order_num = "".join(ch for ch in clean_order_num if ch.isalnum() or ch in "-_")[:32]
        reference = f"PTW-{clean_order_num}-REM-{uuid.uuid4().hex[:8].upper()}"
        await db.execute(
            text("""insert into payment_requests
                (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
                values (:id, :order_id, :quote_id, 'remaining', :amount, :reference,
                        :qr_payload, 'active', :expires_at)"""),
            {
                "id": f"pr_{uuid.uuid4().hex}",
                "order_id": order_id,
                "quote_id": remaining_quote["id"],
                "amount": remaining_amount,
                "reference": reference,
                "qr_payload": build_vietqr_image_url(amount_vnd=remaining_amount, reference=reference),
                "expires_at": now + timedelta(days=7),
            },
        )

    # 9. Handle Payment Proofs Upload (Customer) and Confirmation (Admin)
    request_rows = (
        await db.execute(
            text("select id, purpose, status, expires_at from payment_requests where order_id = :id"),
            {"id": order_id},
        )
    ).mappings().all()
    payment_requests_by_id = {str(row["id"]): row for row in request_rows}

    uploaded_proof = False
    uploaded_request_ids: set[str] = set()
    confirmed_payment = False
    rejected_payment_purpose: str | None = None

    for proof in order.get("paymentProofs") or []:
        proof_id = str(proof.get("id") or "")
        request_id = str(proof.get("paymentRequestId") or "")
        if not proof_id or request_id not in payment_requests_by_id:
            continue

        payment_request = payment_requests_by_id[request_id]

        exists = (
            await db.execute(
                text("select id, payment_request_id, status, uploaded_at from payment_proofs where id = :id"),
                {"id": proof_id},
            )
        ).mappings().first()

        if exists and str(exists["payment_request_id"]) != request_id:
            raise ValueError(
                "PAYMENT_PROOF_REQUEST_MISMATCH: Minh chứng không thuộc yêu cầu thanh toán đang xác nhận."
            )

        if exists and internal and proof.get("status") in {"accepted", "rejected"}:
            if "order.confirm_payment" not in permissions and "super_admin" not in actor_role_keys:
                raise ValueError("Tài khoản không có quyền xác nhận thanh toán.")
            if proof["status"] == "accepted":
                request_status = str(payment_request["status"])
                request_expires_at = _as_utc(payment_request["expires_at"])
                proof_uploaded_at = _as_utc(exists["uploaded_at"])
                uploaded_on_time = proof_uploaded_at <= request_expires_at
                within_review_grace = now <= request_expires_at + PAYMENT_PROOF_REVIEW_GRACE
                if request_status == "active" and request_expires_at <= now:
                    raise ValueError("PAYMENT_REQUEST_EXPIRED: Yêu cầu thanh toán đã hết hạn.")
                if request_status == "uploaded" and not (uploaded_on_time and within_review_grace):
                    raise ValueError(
                        "PAYMENT_PROOF_REVIEW_EXPIRED: Minh chứng đã quá thời hạn duyệt; hãy từ chối và phát hành yêu cầu mới."
                    )
                if request_status not in {"active", "uploaded"}:
                    raise ValueError("PAYMENT_REQUEST_NOT_CONFIRMABLE: Yêu cầu thanh toán không còn hiệu lực.")
                pr_update = await db.execute(
                    text("""update payment_requests set status = 'confirmed',
                        confirmed_by = :actor_id, confirmed_at = :confirmed_at
                        where id = :request_id and order_id = :order_id
                          and status = :expected_status"""),
                    {
                        "actor_id": actor_id,
                        "confirmed_at": now,
                        "request_id": request_id,
                        "order_id": order_id,
                        "expected_status": request_status,
                    },
                )
                if pr_update.rowcount <= 0:
                    raise ValueError(
                        "PAYMENT_REQUEST_NOT_CONFIRMABLE: Yêu cầu thanh toán không còn hiệu lực."
                    )
                confirmed_payment = True
            else:
                rejected_payment_purpose = str(payment_request["purpose"])
                replacement_status = "active" if _as_utc(payment_request["expires_at"]) > now else "superseded"
                await db.execute(
                    text("""update payment_requests set status = :status
                        where id = :request_id and order_id = :order_id and status = 'uploaded'"""),
                    {"status": replacement_status, "request_id": request_id, "order_id": order_id},
                )
            await db.execute(
                text("update payment_proofs set status = :status where id = :id and payment_request_id = :request_id"),
                {"id": proof_id, "request_id": request_id, "status": proof["status"]},
            )

        if not exists and not internal:
            if not all((proof.get("storageKey"), proof.get("contentType"), proof.get("fileSizeBytes"))):
                raise ValueError("Minh chứng thanh toán thiếu metadata lưu trữ.")
            pending_proof_exists = (
                await db.execute(
                    text("""select 1 from payment_proofs
                        where payment_request_id = :request_id
                          and status = 'pending_admin_confirmation' limit 1"""),
                    {"request_id": request_id},
                )
            ).first()
            if pending_proof_exists:
                raise ValueError(
                    "PAYMENT_PROOF_ALREADY_PENDING: Yêu cầu thanh toán đã có minh chứng chờ duyệt."
                )
            if str(payment_request["status"]) not in {"active", "uploaded"}:
                raise ValueError("PAYMENT_REQUEST_NOT_UPLOADABLE: Yêu cầu thanh toán không còn nhận minh chứng.")
            if _as_utc(payment_request["expires_at"]) <= now:
                raise ValueError("PAYMENT_REQUEST_EXPIRED: Yêu cầu thanh toán đã hết hạn.")
            expected_key_prefix = f"orders/{order_id.lower()}/payment-proof/"
            if not str(proof["storageKey"]).lower().startswith(expected_key_prefix):
                raise ValueError("PAYMENT_PROOF_STORAGE_KEY_INVALID: Đường dẫn minh chứng không thuộc đơn hàng.")
            if str(proof["contentType"]) not in {
                "image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"
            }:
                raise ValueError("PAYMENT_PROOF_CONTENT_TYPE_INVALID: Định dạng minh chứng không hợp lệ.")
            file_size = int(proof["fileSizeBytes"])
            if file_size <= 0 or file_size > 10 * 1024 * 1024:
                raise ValueError("PAYMENT_PROOF_FILE_SIZE_INVALID: Dung lượng minh chứng không hợp lệ.")
            await db.execute(
                text("""insert into payment_proofs
                    (id, payment_request_id, storage_key, file_name, content_type,
                     file_size_bytes, status, uploaded_by, uploaded_at)
                    values (:id, :request_id, :storage_key, :file_name, :content_type,
                            :file_size, 'pending_admin_confirmation', :actor_id, :uploaded_at)"""),
                {
                    "id": proof_id,
                    "request_id": request_id,
                    "storage_key": proof["storageKey"],
                    "file_name": proof["fileName"],
                    "content_type": proof["contentType"],
                    "file_size": file_size,
                    "actor_id": actor_id,
                    "uploaded_at": now,
                },
            )
            uploaded_proof = True
            uploaded_request_ids.add(request_id)

    if uploaded_proof:
        for uploaded_request_id in uploaded_request_ids:
            await db.execute(
                text("""update payment_requests set status = 'uploaded'
                    where id = :request_id and order_id = :order_id and status = 'active'"""),
                {"request_id": uploaded_request_id, "order_id": order_id},
            )

    # 10. Compute Next Payment Status
    if internal:
        if confirmed_payment:
            active_req = (
                await db.execute(
                    text("select purpose from payment_requests where order_id = :order_id and status = 'confirmed' order by confirmed_at desc limit 1"),
                    {"order_id": order_id},
                )
            ).scalar()
            next_payment_status = "deposit_confirmed" if active_req == "deposit" else "paid"
            if active_req in {"full", "remaining"}:
                next_commercial_status = "locked"
        elif rejected_payment_purpose:
            next_payment_status = {
                "deposit": "deposit_requested",
                "full": "full_requested",
                "remaining": "cod_remaining",
            }.get(rejected_payment_purpose, current["payment_status"])
        elif is_marking_delivered and str(current["payment_intent"]) == "deposit_cod":
            next_payment_status = "cod_remaining"
        else:
            next_payment_status = order.get("paymentStatus", current["payment_status"])
    else:
        if is_accepting_quote:
            intent = str(order.get("paymentIntent") or current["payment_intent"])
            next_payment_status = "full_requested" if intent == "pay_full" else "deposit_requested"
        elif uploaded_proof:
            uploaded_purposes = {
                str(payment_requests_by_id[request_id]["purpose"])
                for request_id in uploaded_request_ids
            }
            next_payment_status = "deposit_uploaded" if uploaded_purposes == {"deposit"} else "full_uploaded"
        else:
            next_payment_status = current["payment_status"]

    # 11. Update customer_orders Row
    values = {
        "id": order_id,
        "payment_intent": order.get("paymentIntent") or current["payment_intent"],
        "invoice_requested": bool(order.get("invoiceRequested", current["invoice_requested"])),
        "recipient_name": order.get("recipientName", current["recipient_name"]),
        "recipient_phone": order.get("recipientPhone", current["recipient_phone"]),
        "recipient_address": order.get("recipientAddress", current["recipient_address"]),
        "customer_tax_code": order.get("customerTaxCode", current["customer_tax_code"] if "customer_tax_code" in current else None),
        "customer_note": order.get("customerNote", current["customer_note"] if "customer_note" in current else None),
        "commercial_status": next_commercial_status,
        "payment_status": next_payment_status,
        "fulfillment_status": order.get("fulfillmentStatus", current["fulfillment_status"]) if internal else current["fulfillment_status"],
        "assigned_staff_id": order.get("assignedStaffId", current["assigned_staff_id"]) if internal else current["assigned_staff_id"],
        "now": now,
    }
    await db.execute(
        text("""update customer_orders set payment_intent = :payment_intent,
            invoice_requested = :invoice_requested, recipient_name = :recipient_name,
            recipient_phone = :recipient_phone, recipient_address = :recipient_address,
            customer_tax_code = :customer_tax_code, customer_note = :customer_note,
            commercial_status = :commercial_status, payment_status = :payment_status,
            fulfillment_status = :fulfillment_status, assigned_staff_id = :assigned_staff_id,
            updated_at = :now where id = :id"""),
        values,
    )

    # 12. Insert New Comments
    existing_comments = {
        str(row[0])
        for row in (
            await db.execute(text("select id from order_comments where order_id = :id"), {"id": order_id})
        ).all()
    }
    for comment in order.get("comments") or []:
        comment_id = str(comment.get("id") or f"comment_{uuid.uuid4().hex}")
        if comment_id in existing_comments:
            continue
        audience = str(comment.get("audience") or "customer_visible") if internal else "customer_visible"
        await db.execute(
            text("""insert into order_comments
                (id, order_id, author_id, audience, message, created_at)
                values (:id, :order_id, :actor_id, :audience, :message, :created_at)"""),
            {
                "id": comment_id,
                "order_id": order_id,
                "actor_id": actor_id,
                "audience": audience,
                "message": str(comment.get("message") or "")[:2000],
                "created_at": now,
            },
        )

    # 13. Execute Inventory Stock Commands Atomically
    stock_command = stock_command_for_transition(
        before_commercial=str(current["commercial_status"]),
        after_commercial=str(values["commercial_status"]),
        before_fulfillment=str(current["fulfillment_status"]),
        after_fulfillment=str(values["fulfillment_status"]),
    )
    if stock_command is not None:
        await execute_stock_command(
            db,
            command=stock_command,
            order_id=order_id,
            actor_id=actor_id,
            accepted_quote_id=accepted_quote_row["id"] if accepted_quote_row else None,
        )

    # 14. Execute Canonical Accounting Posting if Applicable
    if internal and confirmed_payment and is_postgres:
        await post_order_accounting(
            db,
            order_id=order_id,
            actor_id=actor_id,
            mode="post_confirmed_payments",
            vat_rate_bps=0,
            require_consumed_stock=False,
        )

    # 15. Record Monotonic Audit Log (order_revision_history)
    actor_user = (
        await db.execute(text("select full_name from app_users where id = :id"), {"id": actor_id})
    ).first()
    actor_name = str(actor_user[0]) if actor_user else ("Quản trị viên" if internal else "Đại lý")

    rev_row = await db.execute(
        text("select coalesce(max(revision_no), 0) from order_revision_history where order_id = :id"),
        {"id": order_id},
    )
    next_rev_no = int(rev_row.scalar() or 0) + 1

    if is_accepting_quote:
        action_type = "accept_quote"
        actor_role = "customer"
    elif is_requesting_changes:
        action_type = "request_changes"
        actor_role = "customer"
    elif internal and (order.get("quoteVersions") or next_commercial_status == "quoted"):
        action_type = "publish_quote"
        actor_role = "admin"
    elif not internal and (order.get("recipientName") or order.get("recipientAddress") or order.get("customerTaxCode")):
        action_type = "update_shipping"
        actor_role = "customer"
    else:
        action_type = "update_order"
        actor_role = "admin" if internal else "customer"

    note = (
        order.get("customerNote")
        or (order.get("comments", [{}])[-1].get("message") if order.get("comments") else "")
        or ""
    )

    # Fetch authoritative persisted snapshots from DB for revision log
    persisted_items_snapshot = (
        await db.execute(
            text("""select id, product_code_snapshot as productCode, product_name_snapshot as productName,
                variant_sku_snapshot as variantSku, variant_label_snapshot as variantLabel,
                variant_image as variantImage, supplier_id as supplierId, quantity,
                unit_price_snapshot as unitPriceSnapshot, locked
                from order_items where order_id = :order_id"""),
            {"order_id": order_id},
        )
    ).mappings().all()

    persisted_quotes_snapshot = (
        await db.execute(
            text("""select id, version, status, subtotal, final_total as finalTotal,
                deposit_amount as depositAmount, cod_remaining as codRemaining,
                expires_at as expiresAt, published_by as publishedBy,
                accepted_by as acceptedBy, accepted_at as acceptedAt
                from quote_versions where order_id = :order_id order by version asc"""),
            {"order_id": order_id},
        )
    ).mappings().all()

    try:
        await db.execute(
            text("""insert into order_revision_history
                (id, order_id, revision_no, actor_id, actor_name, actor_role,
                 action_type, from_commercial_status, to_commercial_status,
                 items_snapshot, quote_snapshot, shipping_snapshot, note, created_at)
                values (:id, :order_id, :rev_no, :actor_id, :actor_name, :actor_role,
                        :action_type, :from_status, :to_status,
                        CAST(:items_snapshot AS jsonb), CAST(:quote_snapshot AS jsonb),
                        CAST(:shipping_snapshot AS jsonb), :note, :now)"""),
            {
                "id": f"rev_{uuid.uuid4().hex}",
                "order_id": order_id,
                "rev_no": next_rev_no,
                "actor_id": actor_id,
                "actor_name": actor_name,
                "actor_role": actor_role,
                "action_type": action_type,
                "from_status": current["commercial_status"],
                "to_status": next_commercial_status,
                "items_snapshot": json.dumps([dict(row) for row in persisted_items_snapshot], default=str),
                "quote_snapshot": json.dumps([dict(row) for row in persisted_quotes_snapshot], default=str),
                "shipping_snapshot": json.dumps({
                    "recipientName": values["recipient_name"] or "",
                    "recipientPhone": values["recipient_phone"] or "",
                    "recipientAddress": values["recipient_address"] or "",
                    "customerTaxCode": values["customer_tax_code"] or "",
                    "customerNote": values["customer_note"] or "",
                }),
                "note": str(note)[:2000],
                "now": now,
            },
        )
    except Exception as exc:
        if is_postgres:
            raise exc

    await _bump_sync_revisions(db, org_id=current["organization_id"], now=now)
    await db.commit()
    invalidate_orders_cache()
    return {
        "orderId": order_id,
        "orderNumber": str(current["order_number"]),
        "updatedAt": _iso(now) or "",
    }
