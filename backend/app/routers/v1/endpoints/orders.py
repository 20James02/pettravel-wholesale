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
    amount_received = int(payload.get("amount") or 0)

    if not ref_code or amount_received <= 0:
        raise HTTPException(status_code=400, detail="Mã đối soát hoặc số tiền thanh toán không hợp lệ.")

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

    # 2. Idempotent check
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

    # 3. Verify Exact Amount
    expected_amount = int(payment_req["amount"])
    if amount_received != expected_amount:
        raise HTTPException(
            status_code=400,
            detail=f"PAYMENT_AMOUNT_MISMATCH: Số tiền nhận ({amount_received:,} VND) không khớp với số tiền yêu cầu ({expected_amount:,} VND).",
        )

    order_id = payment_req["order_id"]
    purpose = payment_req["purpose"]

    # 4. Resolve Deterministic System Actor
    payment_system_actor_id = os.environ.get("PAYMENT_SYSTEM_ACTOR_ID")
    system_actor = None
    if payment_system_actor_id:
        system_actor = (
            await db.execute(
                text("""select u.id from app_users u
                    join user_roles ur on ur.user_id = u.id
                    left join role_permissions rp on rp.role_id = ur.role_id
                    left join roles r on r.id = ur.role_id
                    where u.id = :actor_id
                      and u.status = 'active'
                      and (r.key in ('super_admin', 'admin', 'admin_manager', 'accountant')
                           or rp.permission_key = 'order.confirm_payment')
                    limit 1"""),
                {"actor_id": payment_system_actor_id},
            )
        ).scalar()

    if not system_actor:
        system_actor = (
            await db.execute(
                text("""select u.id from app_users u
                    join user_roles ur on ur.user_id = u.id
                    left join role_permissions rp on rp.role_id = ur.role_id
                    left join roles r on r.id = ur.role_id
                    where u.status = 'active'
                      and (r.key in ('super_admin', 'admin', 'admin_manager', 'accountant')
                           or rp.permission_key = 'order.confirm_payment')
                    order by u.created_at asc
                    limit 1""")
            )
        ).scalar()

    if not system_actor:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PAYMENT_SYSTEM_ACTOR_INVALID: Không tìm thấy tài khoản hệ thống có quyền xác nhận thanh toán.",
        )

    actor_id = str(system_actor)

    # 5. Update Payment Request to confirmed
    await db.execute(
        text("""update payment_requests
            set status = 'confirmed', confirmed_by = :actor_id, confirmed_at = :now
            where id = :pr_id"""),
        {"pr_id": payment_req["id"], "actor_id": actor_id, "now": now},
    )

    # 6. Update Order Payment Status
    if purpose == "deposit":
        next_payment_status = "deposit_confirmed"
    else:
        next_payment_status = "paid"

    await db.execute(
        text("""update customer_orders
            set payment_status = :payment_status, updated_at = :now
            where id = :order_id"""),
        {"order_id": order_id, "payment_status": next_payment_status, "now": now},
    )

    # 7. Add System Audit Comment
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

