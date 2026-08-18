from decimal import Decimal
import json
from typing import Any, Sequence
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def resolve_deposit_rate_bps(db: AsyncSession, default_bps: int = 3000) -> int:
    """
    Resolve authoritative deposit rate in basis points (10000 bps = 100%).
    Reads strictly from app_settings where key = 'admin_policy'.
    Fails closed if the policy row exists but contains invalid data.
    Defaults to 3000 bps (30%) only if the policy row is absent.
    """
    row = (
        await db.execute(
            text("select value from app_settings where key = 'admin_policy'")
        )
    ).scalar()

    if row is None:
        return default_bps

    try:
        policy = json.loads(row) if isinstance(row, str) else row
        if not isinstance(policy, dict):
            raise ValueError("POLICY_CONFIGURATION_INVALID: Policy value must be a JSON object.")

        if "defaultDepositRateBps" in policy:
            bps = int(policy["defaultDepositRateBps"])
        elif "defaultDepositRate" in policy:
            rate = Decimal(str(policy["defaultDepositRate"]))
            bps = int(rate * Decimal("10000"))
        else:
            return default_bps

        if not (0 <= bps <= 10000):
            raise ValueError(f"POLICY_CONFIGURATION_INVALID: defaultDepositRateBps ({bps}) must be between 0 and 10000.")
        return bps
    except Exception as exc:
        if isinstance(exc, ValueError) and "POLICY_CONFIGURATION_INVALID" in str(exc):
            raise
        raise ValueError(f"POLICY_CONFIGURATION_INVALID: {exc}") from exc


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
    - final_total = subtotal + signed_adjustments (MUST NOT be negative)
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

    raw_total = subtotal + adjustment_total
    if raw_total < 0:
        raise ValueError(f"QUOTE_FINAL_TOTAL_NEGATIVE: Tổng giá trị báo giá ({raw_total:,} VND) không thể là số âm sau khi áp dụng điều chỉnh.")

    final_total = raw_total

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

