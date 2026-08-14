from collections import OrderedDict
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.canonical_accounting import post_order_accounting


router = APIRouter()


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


@router.get("/journal-entries", response_model=List[Dict[str, Any]])
async def list_journal_entries(
    status_filter: str = "all",
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    if status_filter not in {"all", "draft", "posted", "void"}:
        raise HTTPException(status_code=400, detail="Trạng thái bút toán không hợp lệ.")
    limit = max(1, min(limit, 200))
    rows = (
        await db.execute(
            text("""select
                je.id, je.entry_no, je.description, je.status, je.source_type,
                je.source_id, je.created_at, je.posted_at,
                jl.line_no, jl.account_code, jl.account_name,
                jl.debit_amount, jl.credit_amount, jl.memo,
                jl.order_id, jl.supplier_id, jl.partner_org_id
            from journal_entries je
            left join journal_lines jl on jl.entry_id = je.id
            where (:status_filter = 'all' or je.status = :status_filter)
            order by je.created_at desc, je.id, jl.line_no
            limit :row_limit"""),
            {"status_filter": status_filter, "row_limit": limit * 20},
        )
    ).mappings().all()

    entries: OrderedDict[str, dict[str, Any]] = OrderedDict()
    for row in rows:
        entry = entries.setdefault(
            str(row["id"]),
            {
                "id": row["id"],
                "entryNo": row["entry_no"],
                "description": row["description"],
                "status": row["status"],
                "sourceType": row["source_type"],
                "sourceId": row["source_id"],
                "createdAt": _iso(row["created_at"]),
                "postedAt": _iso(row["posted_at"]),
                "debitTotalVnd": 0,
                "creditTotalVnd": 0,
                "isBalanced": False,
                "lines": [],
            },
        )
        if row["line_no"] is not None:
            debit = int(row["debit_amount"] or 0)
            credit = int(row["credit_amount"] or 0)
            entry["debitTotalVnd"] += debit
            entry["creditTotalVnd"] += credit
            entry["lines"].append(
                {
                    "lineNo": row["line_no"],
                    "accountCode": row["account_code"],
                    "accountName": row["account_name"],
                    "debitAmountVnd": debit,
                    "creditAmountVnd": credit,
                    "memo": row["memo"],
                    "orderId": row["order_id"],
                    "supplierId": row["supplier_id"],
                    "partnerOrgId": row["partner_org_id"],
                }
            )

    output = list(entries.values())[:limit]
    for entry in output:
        entry["isBalanced"] = (
            entry["debitTotalVnd"] > 0
            and entry["debitTotalVnd"] == entry["creditTotalVnd"]
        )
    return output


@router.post("/order-posting", response_model=Dict[str, Any])
async def manual_order_posting(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    order_id = str(payload.get("orderId") or "")
    actor_id = str(payload.get("actorId") or "")
    if not order_id or not actor_id:
        raise HTTPException(status_code=400, detail="Thiếu orderId hoặc actorId.")

    try:
        result = await post_order_accounting(
            db,
            order_id=order_id,
            actor_id=actor_id,
            mode=str(payload.get("mode") or "post_all"),
            vat_rate_bps=int(payload.get("vatRateBps") or 0),
            require_consumed_stock=bool(payload.get("requireConsumedStock", True)),
        )
        await db.commit()
        return {"status": "success", "message": "Đã ghi sổ kế toán cho đơn hàng.", "result": result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Lỗi hệ thống khi ghi sổ kế toán.") from exc


@router.get("/overview", response_model=Dict[str, Any])
async def get_accounting_overview(
    org_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if not org_id:
        raise HTTPException(status_code=400, detail="Thiếu organization id.")

    counts = (
        await db.execute(
            text("""select
                (select count(*) from accounting_periods where organization_id = :org_id) as periods_total,
                (select count(*) from accounting_periods where organization_id = :org_id and status = 'open') as open_periods,
                (select count(*) from accounting_periods where organization_id = :org_id and status = 'closed') as closed_periods,
                (select count(*) from journal_entries where organization_id = :org_id and status = 'draft') as draft_entries,
                (select count(*) from journal_entries where organization_id = :org_id and status = 'posted') as posted_entries,
                (select count(*) from journal_entries where organization_id = :org_id and status = 'void') as void_entries"""),
            {"org_id": org_id},
        )
    ).mappings().one()
    recent = (
        await db.execute(
            text("""select id, entry_no, description, status, source_type, source_id, created_at, posted_at
                from journal_entries where organization_id = :org_id
                order by created_at desc limit 10"""),
            {"org_id": org_id},
        )
    ).mappings().all()

    return {
        "periodsTotal": int(counts["periods_total"] or 0),
        "openPeriods": int(counts["open_periods"] or 0),
        "closedPeriods": int(counts["closed_periods"] or 0),
        "draftEntries": int(counts["draft_entries"] or 0),
        "postedEntries": int(counts["posted_entries"] or 0),
        "voidEntries": int(counts["void_entries"] or 0),
        "recentEntries": [
            {
                "id": row["id"],
                "entryNo": row["entry_no"],
                "description": row["description"],
                "status": row["status"],
                "sourceType": row["source_type"],
                "sourceId": row["source_id"],
                "createdAt": _iso(row["created_at"]),
                "postedAt": _iso(row["posted_at"]),
            }
            for row in recent
        ],
    }
