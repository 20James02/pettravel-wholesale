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
    validate_fulfillment_transition,
)
from app.services.pricing import calculate_quote_financials, resolve_deposit_rate_bps
from app.services.canonical_accounting import post_order_accounting


class OrderConflictError(ValueError):
    """Raised when a caller tries to overwrite a newer order revision or accepts a stale quote."""


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
                "quote_snapshot": json.dumps(order.get("quoteVersions") or []),
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

    if internal:
        permission_changes = {
            "order.quote": (
                order.get("commercialStatus", current["commercial_status"]) != current["commercial_status"]
                or order.get("assignedStaffId", current["assigned_staff_id"]) != current["assigned_staff_id"]
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

    if order.get("fulfillmentStatus") is not None:
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

        if not target_quote_id and not target_quote_version and order.get("quoteVersions"):
            for q in order["quoteVersions"]:
                if q.get("id") or q.get("version"):
                    target_quote_id = q.get("id")
                    target_quote_version = q.get("version")
                    break

        quote_for_update = "for update" if is_postgres else ""
        quote_query = f"select * from quote_versions where order_id = :order_id and status = 'published'"
        quote_params: dict[str, Any] = {"order_id": order_id}

        if target_quote_id:
            quote_query += " and id = :quote_id"
            quote_params["quote_id"] = str(target_quote_id)
        elif target_quote_version:
            quote_query += " and version = :version"
            quote_params["version"] = int(target_quote_version)
        else:
            raise OrderConflictError("Thiếu thông tin nhận diện báo giá cần chấp thuận (acceptedQuoteId hoặc acceptedQuoteVersion).")

        quote_query += f" order by version desc limit 1 {quote_for_update}"
        db_quote = (await db.execute(text(quote_query), quote_params)).mappings().first()
        if not db_quote:
            raise OrderConflictError("Báo giá đã thay đổi, bị hủy hoặc đã hết hiệu lực. Vui lòng tải lại trang.")

        # Check expiry
        quote_expires_at = _as_utc(db_quote["expires_at"])
        if quote_expires_at < now:
            raise ValueError("Báo giá đã hết hạn. Vui lòng gửi yêu cầu để nhân viên báo giá lại.")

        # Verify adjustment approvals
        unapproved_adj = (
            await db.execute(
                text("""select count(*) from quote_adjustments
                    where quote_id = :quote_id and requires_approval = true and approved_by is null"""),
                {"quote_id": db_quote["id"]},
            )
        ).scalar()
        if unapproved_adj and int(unapproved_adj) > 0:
            raise ValueError("Báo giá có điều chỉnh đặc biệt chưa được phê duyệt.")

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

    # 5. Handle Admin Quote Publishing & Editing
    if internal and order.get("quoteVersions") is not None:
        if "order.quote" not in permissions and "super_admin" not in actor_role_keys:
            raise ValueError("Tài khoản không có quyền xuất bản báo giá.")

        highest_version = int(current["current_quote_version"] or 0)
        items_for_pricing = order.get("items") or (
            await db.execute(
                text("select quantity, unit_price_snapshot from order_items where order_id = :order_id"),
                {"order_id": order_id},
            )
        ).mappings().all()

        deposit_rate_bps = await resolve_deposit_rate_bps(db, default_bps=3000)

        for quote in order.get("quoteVersions") or []:
            quote_id = str(quote.get("id") or f"quote_{uuid.uuid4().hex}")
            version = int(quote.get("version") or 0)
            if version <= 0:
                raise ValueError("Phiên bản báo giá không hợp lệ.")
            highest_version = max(highest_version, version)

            adjustments = quote.get("adjustments") or []
            requires_manager_approval = any(bool(adj.get("requiresApproval")) for adj in adjustments)
            if (
                quote.get("status") in {"published", "accepted"}
                and requires_manager_approval
                and not actor_role_keys.intersection({"super_admin", "admin_manager"})
            ):
                raise ValueError("Báo giá có điều chỉnh đặc biệt phải được quản lý phê duyệt trước khi phát hành.")

            # Authoritative Server-Side Calculation
            intent = str(order.get("paymentIntent") or current["payment_intent"])
            calc = calculate_quote_financials(
                items=items_for_pricing,
                adjustments=adjustments,
                payment_intent=intent,
                deposit_rate_bps=deposit_rate_bps,
            )

            expires_at = quote.get("expiresAt")
            if isinstance(expires_at, str):
                expires_at_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            else:
                expires_at_dt = now + timedelta(days=3)

            quote_status = str(quote.get("status") or "published")

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
                if quote_exists["status"] == "accepted" and quote_status != "accepted":
                    raise ValueError("Không thể thay đổi trạng thái của báo giá đã được đại lý chấp thuận.")
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

    # 6. Guard Locked Order Items Against Mutation
    locked_items_count = (
        await db.execute(
            text("select count(*) from order_items where order_id = :order_id and locked = true"),
            {"order_id": order_id},
        )
    ).scalar()

    if order.get("items") is not None:
        if locked_items_count and int(locked_items_count) > 0:
            raise ValueError("Không thể chỉnh sửa danh sách sản phẩm của đơn hàng đã khóa báo giá thương mại.")

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
            sku = str(item.get("variantSku") or "")
            supplier_id = str(item.get("supplierId") or "sup_pettravel")
            quantity = int(item.get("quantity") or 1)
            
            # Authoritative pricing lookup
            catalog_price = (
                await db.execute(
                    text("""select so.wholesale_price, p.code, p.name, v.label
                        from product_variants v
                        join products p on p.id = v.product_id
                        join supplier_offers so on so.product_variant_id = v.id and so.supplier_id = :supplier_id
                        where v.sku = :sku limit 1"""),
                    {"sku": sku, "supplier_id": supplier_id},
                )
            ).mappings().first()
            
            unit_price = int(catalog_price["wholesale_price"] if catalog_price else (item.get("unitPriceSnapshot") or 0))
            product_code = str(catalog_price["code"] if catalog_price else (item.get("productCode") or ""))
            product_name = str(catalog_price["name"] if catalog_price else (item.get("productName") or ""))
            variant_label = str(catalog_price["label"] if catalog_price else (item.get("variantLabel") or sku))
            variant_image = str(item.get("variantImage") or "")

            if item_id in existing_item_ids:
                await db.execute(
                    text("""update order_items set
                        quantity = :quantity,
                        unit_price_snapshot = :unit_price,
                        variant_label_snapshot = :variant_label,
                        variant_image = :variant_image
                        where id = :id and order_id = :order_id"""),
                    {
                        "id": item_id,
                        "order_id": order_id,
                        "quantity": quantity,
                        "unit_price": unit_price,
                        "variant_label": variant_label,
                        "variant_image": variant_image,
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
        qr_payload = f"https://img.vietqr.io/image/MB-0335022888-compact2.png?amount={expected_amount}&addInfo={ref_code}&accountName=PET%20TRAVEL%20WHOLESALE"
        
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

    # 9. Handle Payment Proofs Upload (Customer) and Confirmation (Admin)
    request_ids = {
        str(row[0])
        for row in (
            await db.execute(text("select id from payment_requests where order_id = :id"), {"id": order_id})
        ).all()
    }

    uploaded_proof = False
    uploaded_request_ids: set[str] = set()
    confirmed_payment = False

    for proof in order.get("paymentProofs") or []:
        proof_id = str(proof.get("id") or "")
        request_id = str(proof.get("paymentRequestId") or "")
        if not proof_id or request_id not in request_ids:
            continue

        exists = (
            await db.execute(text("select id, status from payment_proofs where id = :id"), {"id": proof_id})
        ).mappings().first()

        if exists and internal and proof.get("status") in {"accepted", "rejected"}:
            if "order.confirm_payment" not in permissions and "super_admin" not in actor_role_keys:
                raise ValueError("Tài khoản không có quyền xác nhận thanh toán.")
            await db.execute(
                text("update payment_proofs set status = :status where id = :id"),
                {"id": proof_id, "status": proof["status"]},
            )
            if proof["status"] == "accepted":
                pr_update = await db.execute(
                    text("""update payment_requests set status = 'confirmed',
                        confirmed_by = :actor_id, confirmed_at = :confirmed_at
                        where id = :request_id and order_id = :order_id
                          and status in ('active', 'uploaded')"""),
                    {
                        "actor_id": actor_id,
                        "confirmed_at": now,
                        "request_id": request_id,
                        "order_id": order_id,
                    },
                )
                if pr_update.rowcount > 0:
                    confirmed_payment = True

        if not exists and not internal:
            if not all((proof.get("storageKey"), proof.get("contentType"), proof.get("fileSizeBytes"))):
                raise ValueError("Minh chứng thanh toán thiếu metadata lưu trữ.")
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
                    "file_size": int(proof["fileSizeBytes"]),
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
        else:
            next_payment_status = order.get("paymentStatus", current["payment_status"])
    else:
        if is_accepting_quote:
            intent = str(order.get("paymentIntent") or current["payment_intent"])
            next_payment_status = "full_requested" if intent == "pay_full" else "deposit_requested"
        elif uploaded_proof:
            latest_purpose = (
                await db.execute(
                    text("select purpose from payment_requests where order_id = :order_id order by expires_at desc limit 1"),
                    {"order_id": order_id},
                )
            ).scalar()
            next_payment_status = "deposit_uploaded" if latest_purpose == "deposit" else "full_uploaded"
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
