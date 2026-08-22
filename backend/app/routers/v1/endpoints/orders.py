from __future__ import annotations

from datetime import datetime, timezone
import os
from typing import Any, Dict
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.pricing import calculate_quote_financials, resolve_deposit_rate_bps
from app.services.canonical_accounting import post_order_accounting
from app.services.order_workflow import execute_stock_command

router = APIRouter()


def _parse_positive_vnd(value: Any) -> int:
    if isinstance(value, bool):
        raise HTTPException(status_code=400, detail="Số tiền thanh toán phải là số nguyên VND dương.")
    if isinstance(value, int):
        amount = value
    elif isinstance(value, str) and value.strip().isdigit():
        amount = int(value.strip())
    else:
        raise HTTPException(status_code=400, detail="Số tiền thanh toán phải là số nguyên VND dương.")
    if amount <= 0 or amount > 1_000_000_000_000:
        raise HTTPException(status_code=400, detail="Số tiền thanh toán nằm ngoài giới hạn cho phép.")
    return amount


@router.post("/", include_in_schema=False)
async def create_wholesale_order_deprecated():
    """Deprecated legacy order creation path."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Legacy order writer endpoint has been retired. Use /api/v1/orders/save.",
    )


@router.post("/legacy-save", include_in_schema=False)
async def save_order_deprecated():
    """Deprecated legacy order save path."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Legacy order save endpoint has been retired. Use /api/v1/orders/save.",
    )


@router.get("/legacy-list", include_in_schema=False)
async def list_orders_deprecated():
    """Deprecated legacy order list path."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Legacy order list endpoint has been retired. Use /api/v1/orders/list or /api/v1/orders/summary.",
    )


@router.post("/calculate-financials", response_model=Dict[str, Any])
async def calculate_financials(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """
    Authoritative calculation preview using canonical pricing engine.
    Guarantees strict parity between backend preview and persisted quotes.
    """
    items = payload.get("items", [])
    adjustments = payload.get("adjustments", [])
    payment_intent = payload.get("paymentIntent", "deposit_cod")
    deposit_rate_bps = payload.get("depositRateBps") or await resolve_deposit_rate_bps(db, default_bps=3000)

    try:
        calc = calculate_quote_financials(
            items=items,
            adjustments=adjustments,
            payment_intent=payment_intent,
            deposit_rate_bps=int(deposit_rate_bps),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "subtotal": calc["subtotal"],
        "adjustmentTotal": calc["adjustmentTotal"],
        "finalTotal": calc["finalTotal"],
        "depositAmount": calc["depositAmount"],
        "codRemaining": calc["codRemaining"],
        "paymentDueNow": calc["depositAmount"],
    }


@router.post("/webhook/vietqr")
async def vietqr_webhook(
    payload: Dict[str, Any],
    x_webhook_secret: str | None = Header(None, alias="x-webhook-secret"),
    db: AsyncSession = Depends(get_db),
):
    """
    Authoritative canonical VietQR bank webhook.
    - Provider authentication (Fail-Closed, isolated from internal BFF secret)
    - Idempotent row locking
    - Server-side reference resolution
    - Exact amount verification (PAYMENT_AMOUNT_MISMATCH)
    - Canonical state machine & atomic accounting posting
    """
    expected_secret = os.environ.get("VIETQR_WEBHOOK_SECRET")
    if not expected_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PAYMENT_WEBHOOK_NOT_CONFIGURED: Chưa cấu hình VIETQR_WEBHOOK_SECRET trên máy chủ.",
        )

    import secrets
    if not x_webhook_secret or not secrets.compare_digest(x_webhook_secret, expected_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook signature verification failed.",
        )

    now = datetime.now(timezone.utc)
    ref_code = str(payload.get("reference") or payload.get("addInfo") or payload.get("content") or "").strip().upper()
    if len(ref_code) > 128:
        raise HTTPException(status_code=400, detail="Mã đối soát vượt quá giới hạn cho phép.")
    amount_received = _parse_positive_vnd(payload.get("amount"))

    if not ref_code:
        raise HTTPException(status_code=400, detail="Mã đối soát thanh toán không hợp lệ.")

    # 1. Resolve active or uploaded payment request with exact reference
    is_postgres = db.get_bind().dialect.name == "postgresql"
    for_update = "for update of pr, o" if is_postgres else ""
    payment_req = (
        await db.execute(
            text(f"""select pr.*, o.order_number, o.organization_id, o.commercial_status
                from payment_requests pr
                join customer_orders o on o.id = pr.order_id
                where upper(pr.reference) = :ref_code
                {for_update}"""),
            {"ref_code": ref_code},
        )
    ).mappings().first()

    if not payment_req:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu thanh toán phù hợp với mã đối soát.")

    # 2. Verify amount before idempotent handling so conflicting replays are visible.
    expected_amount = int(payment_req["amount"])
    if amount_received != expected_amount:
        raise HTTPException(
            status_code=400,
            detail=f"PAYMENT_AMOUNT_MISMATCH: Số tiền nhận ({amount_received:,} VND) không khớp với số tiền yêu cầu ({expected_amount:,} VND).",
        )

    # 3. Idempotency and expiry checks
    if payment_req["status"] == "confirmed":
        return {
            "status": "success",
            "message": "Giao dịch thanh toán đã được xác nhận trước đó (Idempotent).",
            "orderId": payment_req["order_id"],
            "orderNumber": payment_req["order_number"],
            "idempotent": True,
        }

    if payment_req["status"] not in {"active", "uploaded"}:
        raise HTTPException(status_code=400, detail=f"Yêu cầu thanh toán đang ở trạng thái không hợp lệ: {payment_req['status']}.")

    expires_at = payment_req["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at.astimezone(timezone.utc) <= now:
        await db.execute(
            text("update payment_requests set status = 'expired' where id = :id and status in ('active', 'uploaded')"),
            {"id": payment_req["id"]},
        )
        await db.commit()
        raise HTTPException(status_code=400, detail="PAYMENT_REQUEST_EXPIRED: Yêu cầu thanh toán đã hết hạn.")

    order_id = payment_req["order_id"]
    purpose = payment_req["purpose"]

    # 4. Resolve Deterministic System Actor (Fail-Closed, Zero Fallback)
    payment_system_actor_id = os.environ.get("PAYMENT_SYSTEM_ACTOR_ID")
    if not payment_system_actor_id or not payment_system_actor_id.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PAYMENT_SYSTEM_ACTOR_NOT_CONFIGURED: Chưa cấu hình PAYMENT_SYSTEM_ACTOR_ID trên máy chủ.",
        )

    actor_row = (
        await db.execute(
            text("select id, status from app_users where id = :actor_id"),
            {"actor_id": payment_system_actor_id.strip()},
        )
    ).mappings().first()

    if not actor_row or actor_row["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PAYMENT_SYSTEM_ACTOR_INVALID: Tài khoản PAYMENT_SYSTEM_ACTOR_ID không tồn tại hoặc không ở trạng thái hoạt động.",
        )

    has_perm = (
        await db.execute(
            text("""select 1 from user_roles ur
                left join role_permissions rp on rp.role_id = ur.role_id
                left join roles r on r.id = ur.role_id
                where ur.user_id = :actor_id
                  and (r.key = 'super_admin' or rp.permission_key = 'order.confirm_payment')
                limit 1"""),
            {"actor_id": payment_system_actor_id.strip()},
        )
    ).scalar()

    if not has_perm:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PAYMENT_SYSTEM_ACTOR_FORBIDDEN: Tài khoản PAYMENT_SYSTEM_ACTOR_ID thiếu quyền order.confirm_payment.",
        )

    actor_id = payment_system_actor_id.strip()

    # 5. Update Payment Request to confirmed
    await db.execute(
        text("""update payment_requests
            set status = 'confirmed', confirmed_by = :actor_id, confirmed_at = :now
            where id = :pr_id"""),
        {"pr_id": payment_req["id"], "actor_id": actor_id, "now": now},
    )
    await db.execute(
        text("""update payment_proofs set status = 'accepted'
            where payment_request_id = :pr_id and status = 'pending_admin_confirmation'"""),
        {"pr_id": payment_req["id"]},
    )

    # 6. Update Order Payment Status
    if purpose == "deposit":
        next_payment_status = "deposit_confirmed"
    else:
        next_payment_status = "paid"
    next_commercial_status = (
        "locked" if purpose in {"full", "remaining"} else str(payment_req["commercial_status"])
    )

    await db.execute(
        text("""update customer_orders
            set payment_status = :payment_status, commercial_status = :commercial_status, updated_at = :now
            where id = :order_id"""),
        {
            "order_id": order_id,
            "payment_status": next_payment_status,
            "commercial_status": next_commercial_status,
            "now": now,
        },
    )

    # 7. Add System Audit Comment and Monotonic Revision History
    actor_user = (
        await db.execute(text("select full_name from app_users where id = :id"), {"id": actor_id})
    ).first()
    actor_name = str(actor_user[0]) if actor_user else "Hệ thống VietQR"

    await db.execute(
        text("""insert into order_comments
            (id, order_id, author_id, audience, message, created_at)
            values (:id, :order_id, :actor_id, 'customer_visible', :message, :now)"""),
        {
            "id": f"comment_{uuid.uuid4().hex}",
            "order_id": order_id,
            "actor_id": actor_id,
            "message": f"Đối soát tự động VietQR Napas 247 thành công. Số tiền: {amount_received:,} VND. Mã tham chiếu: {ref_code}.",
            "now": now,
        },
    )

    rev_row = await db.execute(
        text("select coalesce(max(revision_no), 0) from order_revision_history where order_id = :id"),
        {"id": order_id},
    )
    next_rev_no = int(rev_row.scalar() or 0) + 1

    if is_postgres:
        await db.execute(
            text("""insert into order_revision_history
                (id, order_id, revision_no, actor_id, actor_name, actor_role,
                 action_type, from_commercial_status, to_commercial_status,
                 items_snapshot, quote_snapshot, shipping_snapshot, note, created_at)
                values (:id, :order_id, :rev_no, :actor_id, :actor_name, 'admin',
                        'confirm_payment', :from_status, :to_status,
                        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, :note, :now)"""),
            {
                "id": f"rev_{uuid.uuid4().hex}",
                "order_id": order_id,
                "rev_no": next_rev_no,
                "actor_id": actor_id,
                "actor_name": actor_name,
                "from_status": str(payment_req["commercial_status"]),
                "to_status": next_commercial_status,
                "note": f"Đối soát tự động VietQR thành công: {amount_received:,} VND. Tham chiếu: {ref_code}.",
                "now": now,
            },
        )
    else:
        await db.execute(
            text("""insert into order_revision_history
                (id, order_id, revision_no, actor_id, actor_name, actor_role,
                 action_type, from_commercial_status, to_commercial_status,
                 items_snapshot, quote_snapshot, shipping_snapshot, note, created_at)
                values (:id, :order_id, :rev_no, :actor_id, :actor_name, 'admin',
                        'confirm_payment', :from_status, :to_status,
                        '[]', '[]', '{}', :note, :now)"""),
            {
                "id": f"rev_{uuid.uuid4().hex}",
                "order_id": order_id,
                "rev_no": next_rev_no,
                "actor_id": actor_id,
                "actor_name": actor_name,
                "from_status": str(payment_req["commercial_status"]),
                "to_status": next_commercial_status,
                "note": f"Đối soát tự động VietQR thành công: {amount_received:,} VND. Tham chiếu: {ref_code}.",
                "now": now,
            },
        )

    # 8. Trigger Canonical Accounting Posting (Atomic with transaction)
    if is_postgres:
        await post_order_accounting(
            db,
            order_id=order_id,
            actor_id=actor_id,
            mode="post_confirmed_payments",
            vat_rate_bps=0,
            require_consumed_stock=False,
        )

    await db.commit()

    return {
        "status": "success",
        "message": "Đối soát VietQR hoàn tất và đã cập nhật trạng thái đơn hàng thành công.",
        "orderId": order_id,
        "orderNumber": payment_req["order_number"],
        "paymentStatus": next_payment_status,
        "amount": amount_received,
    }
