from __future__ import annotations

from typing import Any, Sequence
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def resolve_deposit_rate_bps(db: AsyncSession, default_bps: int = 3000) -> int:
    """
    Resolve authoritative deposit rate in basis points (10000 bps = 100%).
    Reads from app_settings / admin_policy if configured, otherwise defaults to 3000 bps (30%).
    """
    try:
        row = (
            await db.execute(
                text("select value from app_settings where key in ('admin_policy', 'order_policy') limit 1")
            )
        ).scalar()
        if row:
            import json
            policy = json.loads(row) if isinstance(row, str) else row
            if isinstance(policy, dict):
                if "defaultDepositRateBps" in policy:
                    return int(policy["defaultDepositRateBps"])
                if "defaultDepositRate" in policy:
                    rate = float(policy["defaultDepositRate"])
                    return int(round(rate * 10000))
    except Exception:
        pass
    return default_bps


def calculate_quote_financials(
    *,
    items: Sequence[dict[str, Any]],
    adjustments: Sequence[dict[str, Any]] | None = None,
    payment_intent: str = "deposit_cod",
    deposit_rate_bps: int = 3000,
) -> dict[str, int]:
    """
    Authoritative backend integer VND quote financial calculation.
    Zero floating-point arithmetic.
    
    Invariants:
    - subtotal = sum(quantity * unit_price_snapshot)
    - final_total = max(0, subtotal + signed_adjustments)
    - deposit_amount + cod_remaining == final_total
    - pay_full: deposit_amount = final_total, cod_remaining = 0
    - deposit_cod: deposit_amount = (final_total * deposit_rate_bps) // 10000
    """
    subtotal = 0
    for item in items:
        qty = int(item.get("quantity") or 0)
        price = int(item.get("unitPriceSnapshot") or item.get("unit_price_snapshot") or 0)
        if qty < 0 or price < 0:
            raise ValueError("Số lượng và đơn giá phải là số nguyên không âm.")
        subtotal += qty * price

    adjustment_total = 0
    for adj in adjustments or []:
        raw_amount = int(adj.get("amount") or 0)
        adj_type = str(adj.get("type") or "discount")
        if adj_type == "shipping_fee":
            adjustment_total += raw_amount
        else:
            adjustment_total -= abs(raw_amount)

    final_total = max(0, subtotal + adjustment_total)

    if payment_intent == "pay_full":
        deposit_amount = final_total
        cod_remaining = 0
    else:
        # Basis points calculation: 10000 bps = 100%
        # Integer division with floor/truncation
        deposit_amount = (final_total * deposit_rate_bps) // 10000
        if deposit_amount > final_total:
            deposit_amount = final_total
        cod_remaining = final_total - deposit_amount

    return {
        "subtotal": subtotal,
        "adjustmentTotal": adjustment_total,
        "finalTotal": final_total,
        "depositAmount": deposit_amount,
        "codRemaining": cod_remaining,
    }
