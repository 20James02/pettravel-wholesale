from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


POSTING_MODES = {"post_all", "post_confirmed_payments", "recognize_sale"}


async def post_order_accounting(
    db: AsyncSession,
    *,
    order_id: str,
    actor_id: str,
    mode: str,
    vat_rate_bps: int,
    require_consumed_stock: bool,
) -> dict[str, Any]:
    if mode not in POSTING_MODES:
        raise ValueError("Chế độ ghi sổ không hợp lệ.")
    if not 0 <= vat_rate_bps <= 10_000:
        raise ValueError("Thuế suất phải nằm trong khoảng 0 đến 10000 điểm cơ bản.")

    parameters = {
        "order_id": order_id,
        "actor_id": actor_id,
        "mode": mode,
        "vat_rate_bps": vat_rate_bps,
        "require_consumed_stock": require_consumed_stock,
    }
    result = await db.execute(
        text("""select pt_post_order_accounting(
            :order_id, :actor_id, :mode, :vat_rate_bps, :require_consumed_stock
        )"""),
        parameters,
    )
    value = result.scalar_one()
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise RuntimeError("Hàm ghi sổ trả về dữ liệu không hợp lệ.")
    return value
