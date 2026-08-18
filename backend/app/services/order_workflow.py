from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


StockCommand = Literal["reserve_order", "cancel_order", "consume_order"]


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
) -> dict[str, Any] | None:
    """Execute the PostgreSQL reservation contract in the caller transaction."""
    if db.get_bind().dialect.name != "postgresql":
        return None

    reserving_actor = actor_id
    if command == "reserve_order":
        # If the actor is a customer buyer, resolve the internal seller/staff actor
        # who published the quote or is assigned to manage order inventory.
        is_internal = (
            await db.execute(
                text("""select 1 from user_roles ur
                    join role_permissions rp on rp.role_id = ur.role_id
                    where ur.user_id = :actor_id
                      and rp.permission_key in ('operations.write', 'order.quote')
                    limit 1"""),
                {"actor_id": actor_id},
            )
        ).scalar()
        if not is_internal:
            internal_actor = (
                await db.execute(
                    text("""select q.published_by
                        from quote_versions q
                        join app_users u on u.id = q.published_by
                        where q.order_id = :order_id and q.status in ('published', 'accepted')
                          and u.status = 'active'
                        order by q.version desc limit 1"""),
                    {"order_id": order_id},
                )
            ).scalar()
            if not internal_actor:
                internal_actor = (
                    await db.execute(
                        text("""select o.assigned_staff_id
                            from customer_orders o
                            join app_users u on u.id = o.assigned_staff_id
                            where o.id = :order_id and u.status = 'active'"""),
                        {"order_id": order_id},
                    )
                ).scalar()
            if not internal_actor:
                internal_actor = (
                    await db.execute(
                        text("""select ur.user_id
                            from user_roles ur
                            join role_permissions rp on rp.role_id = ur.role_id
                            join app_users u on u.id = ur.user_id
                            where rp.permission_key in ('operations.write', 'order.quote')
                              and u.status = 'active'
                            limit 1""")
                    )
                ).scalar()
            if internal_actor:
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
