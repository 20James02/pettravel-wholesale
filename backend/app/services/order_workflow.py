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
    """Return the single inventory command implied by an order transition."""
    if after_commercial == "cancelled" and before_commercial != "cancelled":
        return "cancel_order"
    if after_fulfillment == "shipped" and before_fulfillment != "shipped":
        return "consume_order"
    if (
        after_commercial in {"customer_accepted", "locked"}
        and before_commercial not in {"customer_accepted", "locked"}
    ):
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

    if command == "reserve_order":
        result = await db.execute(
            text("select pt_reserve_order_stock(:order_id, :actor_id, :expires_at)"),
            {
                "order_id": order_id,
                "actor_id": actor_id,
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
    if command == "consume_order" and int((payload or {}).get("lineCount", 0)) == 0:
        raise ValueError("Không thể xuất kho vì đơn hàng chưa có giữ chỗ tồn kho đang hoạt động.")
    return payload
