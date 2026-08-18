from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from typing import Any, Literal, Set

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


StockCommand = Literal["reserve_order", "cancel_order", "consume_order"]


def validate_commercial_transition(
    *,
    actor_is_internal: bool,
    permissions: Set[str],
    before: str,
    after: str,
) -> None:
    """
    Authoritative state machine transition matrix for commercialStatus.
    Rejects invalid jumps and enforces permission boundaries.
    """
    if before == after:
        return

    # Terminal state check
    if before == "cancelled":
        raise ValueError(f"Không thể chuyển trạng thái từ đơn hàng đã bị hủy ('{before}').")

    # Cancellation rules
    if after == "cancelled":
        if before in {"draft", "submitted", "admin_review", "quoted"}:
            return
        if before == "customer_accepted":
            if actor_is_internal and ("order.quote" in permissions or "super_admin" in permissions):
                return
            raise ValueError("Chỉ quản trị viên mới có thể hủy đơn hàng sau khi báo giá đã được chấp thuận.")
        if before == "locked":
            if actor_is_internal and ("order.quote" in permissions or "super_admin" in permissions):
                return
            raise ValueError("Không thể hủy đơn hàng đã bị khóa xử lý.")
        raise ValueError(f"Không thể hủy đơn hàng từ trạng thái '{before}'.")

    # Customer-driven transitions
    if not actor_is_internal:
        if before == "draft" and after == "submitted":
            return
        if before == "quoted" and after == "customer_accepted":
            return
        if before == "quoted" and after == "admin_review":
            return
        raise ValueError(f"Đại lý không có quyền chuyển trạng thái từ '{before}' sang '{after}'.")

    # Internal operator transitions (Internal actors CANNOT accept quotes on behalf of customer)
    allowed_internal_transitions = {
        ("draft", "submitted"),
        ("submitted", "admin_review"),
        ("submitted", "quoted"),
        ("admin_review", "quoted"),
        ("quoted", "admin_review"),
        ("customer_accepted", "locked"),
    }
    if (before, after) not in allowed_internal_transitions:
        raise ValueError(f"Chuyển trạng thái thương mại từ '{before}' sang '{after}' không hợp lệ.")


def validate_fulfillment_transition(
    *,
    before: str,
    after: str,
) -> None:
    """
    Authoritative linear adjacent-only transition matrix for fulfillmentStatus.
    Invariants:
    - after_index == before_index + 1 (or before == after for idempotent no-op)
    - No skipping states
    - No backwards transitions
    - No transitions from delivered
    """
    if before == after:
        return

    allowed_chain = [
        "not_started",
        "supplier_checking",
        "supplier_confirmed",
        "packing",
        "ready_to_ship",
        "shipped",
        "delivered",
    ]
    if before not in allowed_chain or after not in allowed_chain:
        raise ValueError(f"Trạng thái giao hàng không hợp lệ: '{before}' hoặc '{after}'.")

    before_idx = allowed_chain.index(before)
    after_idx = allowed_chain.index(after)

    # Strictly enforce adjacent forward progression
    if after_idx != before_idx + 1:
        if after_idx < before_idx:
            raise ValueError(f"Không thể chuyển ngược trạng thái giao hàng từ '{before}' về '{after}'.")
        raise ValueError(
            f"Trạng thái giao hàng chỉ được phép chuyển liền kề theo thứ tự: '{before}' -> '{allowed_chain[before_idx + 1]}'. (Không được bỏ qua trạng thái)"
        )


def stock_command_for_transition(
    *,
    before_commercial: str,
    after_commercial: str,
    before_fulfillment: str,
    after_fulfillment: str,
) -> StockCommand | None:
    """
    Return the single inventory command implied by an order transition.
    Source of truth: ADR-017 (Quote acceptance & stock reservation atomic).
    """
    if after_commercial == "cancelled" and before_commercial != "cancelled":
        return "cancel_order"
    if after_fulfillment == "shipped" and before_fulfillment != "shipped":
        return "consume_order"
    if after_commercial == "customer_accepted" and before_commercial != "customer_accepted":
        return "reserve_order"
    return None


async def execute_stock_command(
    db: AsyncSession,
    *,
    command: StockCommand,
    order_id: str,
    actor_id: str,
    accepted_quote_id: str | None = None,
) -> dict[str, Any] | None:
    """Execute the PostgreSQL reservation contract in the caller transaction."""
    if db.get_bind().dialect.name != "postgresql":
        return None

    reserving_actor = actor_id
    if command == "reserve_order":
        # Check if the actor is internal with operational permission
        is_internal = (
            await db.execute(
                text("""select 1 from user_roles ur
                    join roles r on r.id = ur.role_id
                    left join role_permissions rp on rp.role_id = ur.role_id
                    where ur.user_id = :actor_id
                      and (r.key in ('super_admin', 'admin', 'admin_manager')
                           or rp.permission_key in ('operations.write', 'order.quote'))
                    limit 1"""),
                {"actor_id": actor_id},
            )
        ).scalar()

        if not is_internal:
            # Deterministic attribution:
            # 1. Staff who published the exact accepted quote (must be active and hold permission)
            internal_actor = None
            if accepted_quote_id:
                internal_actor = (
                    await db.execute(
                        text("""select q.published_by
                            from quote_versions q
                            join app_users u on u.id = q.published_by
                            join user_roles ur on ur.user_id = u.id
                            join roles r on r.id = ur.role_id
                            left join role_permissions rp on rp.role_id = ur.role_id
                            where q.id = :quote_id
                              and u.status = 'active'
                              and (r.key in ('super_admin', 'admin', 'admin_manager')
                                   or rp.permission_key in ('operations.write', 'order.quote'))
                            limit 1"""),
                        {"quote_id": accepted_quote_id},
                    )
                ).scalar()

            # 2. Staff assigned to the order (must be active and hold permission)
            if not internal_actor:
                internal_actor = (
                    await db.execute(
                        text("""select o.assigned_staff_id
                            from customer_orders o
                            join app_users u on u.id = o.assigned_staff_id
                            join user_roles ur on ur.user_id = u.id
                            join roles r on r.id = ur.role_id
                            left join role_permissions rp on rp.role_id = ur.role_id
                            where o.id = :order_id
                              and u.status = 'active'
                              and (r.key in ('super_admin', 'admin', 'admin_manager')
                                   or rp.permission_key in ('operations.write', 'order.quote'))
                            limit 1"""),
                        {"order_id": order_id},
                    )
                ).scalar()

            if not internal_actor:
                raise ValueError("RESERVATION_OPERATOR_UNAVAILABLE: Không thể xác định nhân viên phụ trách có đủ quyền giữ tồn kho.")

            reserving_actor = str(internal_actor)

        result = await db.execute(
            text("select pt_reserve_order_stock(:order_id, :actor_id, :expires_at)"),
            {
                "order_id": order_id,
                "actor_id": reserving_actor,
                "expires_at": datetime.now(timezone.utc) + timedelta(hours=72),
            },
        )
    else:
        result = await db.execute(
            text("""select pt_transition_order_stock_reservations(
                :order_id, :actor_id, :action, :reason)"""),
            {
                "order_id": order_id,
                "actor_id": actor_id,
                "action": command,
                "reason": f"Automatic order workflow transition: {command}",
            },
        )

    payload = result.scalar()
    if isinstance(payload, str):
        payload = json.loads(payload)
    return payload
