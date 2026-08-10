from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import Dict, Any, List
from app.core.db import get_db
from app.models.wholesale import JournalEntry, JournalLine, AccountingPeriod
from app.services.accounting import post_order_sales_and_cost, post_order_deposit_receipt

router = APIRouter()

@router.get("/journal-entries", response_model=List[Dict[str, Any]])
async def list_journal_entries(
    status_filter: str = "all",
    db: AsyncSession = Depends(get_db)
):
    """
    Truy xuất danh sách bút toán nhật ký kế toán kép phục vụ đối soát tài chính B2B.
    """
    query = select(JournalEntry)
    if status_filter != "all":
        query = query.filter(JournalEntry.status == status_filter)
        
    query = query.order_by(JournalEntry.created_at.desc())
    result = await db.execute(query)
    entries = result.scalars().all()
    
    output = []
    for entry in entries:
        # Load dòng hạch toán chi tiết
        line_query = select(JournalLine).filter(JournalLine.entry_id == entry.id)
        line_result = await db.execute(line_query)
        lines = line_result.scalars().all()
        
        lines_data = []
        debit_total = 0
        credit_total = 0
        for line in lines:
            lines_data.append({
                "lineNo": line.line_no,
                "accountCode": line.account_code,
                "accountName": line.account_name,
                "debitAmountVnd": line.debit_amount_vnd,
                "creditAmountVnd": line.credit_amount_vnd,
                "memo": line.memo,
                "orderId": line.order_id,
                "supplierId": line.supplier_id,
                "partnerOrgId": line.partner_org_id
            })
            debit_total += line.debit_amount_vnd
            credit_total += line.credit_amount_vnd
            
        output.append({
            "id": entry.id,
            "entryNo": entry.entry_no,
            "description": entry.description,
            "status": entry.status,
            "sourceType": entry.source_type,
            "sourceId": entry.source_id,
            "createdAt": entry.created_at.isoformat(),
            "postedAt": entry.posted_at.isoformat() if entry.posted_at else None,
            "debitTotalVnd": debit_total,
            "creditTotalVnd": credit_total,
            "isBalanced": debit_total == credit_total,
            "lines": lines_data
        })
        
    return output

@router.post("/order-posting", response_model=Dict[str, Any])
async def manual_order_posting(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    """
    Ghi sổ kế toán thủ công (chủ yếu phục vụ admin sửa đổi hạch toán hoặc ép ghi sổ kế toán).
    """
    order_id = payload.get("orderId")
    mode = payload.get("mode", "post_all") # post_all hoặc post_confirmed_payments
    
    if not order_id:
        raise HTTPException(status_code=400, detail="Thiếu orderId.")
        
    try:
        created_count = 0
        if mode == "post_confirmed_payments":
            await post_order_deposit_receipt(order_id, db)
            created_count = 1
        else:
            # Ghi cả doanh thu & giá vốn
            await post_order_sales_and_cost(order_id, db)
            created_count = 2
            
        await db.commit()
        return {
            "status": "success",
            "message": "Đã ghi sổ kế toán thành công cho đơn hàng sỉ.",
            "result": {
                "createdEntries": created_count,
                "skippedEntries": 0
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Lỗi hệ thống khi ghi sổ kế toán.")

@router.get("/overview", response_model=Dict[str, Any])
async def get_accounting_overview(
    user_id: str = None,
    org_id: str = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Truy xuất tổng hợp hoạt động kế toán.
    """
    # 1. Đếm chu kỳ kế toán
    period_total_query = select(func.count()).select_from(AccountingPeriod)
    if org_id:
        period_total_query = period_total_query.filter(AccountingPeriod.organization_id == org_id)
    
    period_open_query = select(func.count()).select_from(AccountingPeriod).filter(AccountingPeriod.status == "open")
    if org_id:
        period_open_query = period_open_query.filter(AccountingPeriod.organization_id == org_id)
        
    period_closed_query = select(func.count()).select_from(AccountingPeriod).filter(AccountingPeriod.status == "closed")
    if org_id:
        period_closed_query = period_closed_query.filter(AccountingPeriod.organization_id == org_id)
        
    # 2. Đếm bút toán
    draft_query = select(func.count()).select_from(JournalEntry).filter(JournalEntry.status == "draft")
    posted_query = select(func.count()).select_from(JournalEntry).filter(JournalEntry.status == "posted")
    void_query = select(func.count()).select_from(JournalEntry).filter(JournalEntry.status == "void")
    
    # 3. Lấy 10 bút toán gần nhất
    recent_query = select(JournalEntry).order_by(JournalEntry.created_at.desc()).limit(10)
    
    r_period_total = await db.execute(period_total_query)
    r_period_open = await db.execute(period_open_query)
    r_period_closed = await db.execute(period_closed_query)
    
    r_draft = await db.execute(draft_query)
    r_posted = await db.execute(posted_query)
    r_void = await db.execute(void_query)
    
    r_recent = await db.execute(recent_query)
    recent_entries = r_recent.scalars().all()
    
    return {
        "periodsTotal": r_period_total.scalar() or 0,
        "openPeriods": r_period_open.scalar() or 0,
        "closedPeriods": r_period_closed.scalar() or 0,
        "draftEntries": r_draft.scalar() or 0,
        "postedEntries": r_posted.scalar() or 0,
        "voidEntries": r_void.scalar() or 0,
        "recentEntries": [
            {
                "id": e.id,
                "entryNo": e.entry_no,
                "description": e.description,
                "status": e.status,
                "sourceType": e.source_type,
                "sourceId": e.source_id,
                "createdAt": e.created_at.isoformat(),
                "postedAt": e.posted_at.isoformat() if e.posted_at else None
            }
            for e in recent_entries
        ]
    }

