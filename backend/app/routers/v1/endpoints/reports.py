from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Dict, Any, List
import datetime
from app.core.db import get_db

router = APIRouter()

@router.get("/overview", response_model=Dict[str, Any])
async def get_reports_overview(
    org_id: str = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Truy xuất tổng hợp báo cáo quản trị toàn hệ thống.
    """
    alerts = [
        {
            "severity": "info",
            "area": "data",
            "message": "Báo cáo hiện là mixed operational estimate: doanh thu lấy từ đơn/báo giá, tồn kho từ inventory_balances, kế toán từ journal_lines."
        },
        {
            "severity": "warning",
            "area": "reconciliation",
            "message": "Chưa có bank/COD reconciliation batch, nên số tiền đã xác nhận vẫn cần đối chiếu sao kê thật trước khi khóa sổ."
        }
    ]
    
    # 1. Summarize orders
    try:
        order_sql = "SELECT id, number, commercial_status, payment_status, fulfillment_status, payment_intent, invoice_requested, customer_name, customer_company FROM orders"
        r_orders = await db.execute(text(order_sql))
        orders = r_orders.mappings().all()
    except Exception:
        orders = []

    active_orders = 0
    invoice_requested_orders = 0
    estimated_sales_vnd = 0
    estimated_gross_sales_vnd = 0
    discount_and_offer_vnd = 0
    payment_requested_vnd = 0
    payment_confirmed_vnd = 0
    payment_pending_proof_vnd = 0
    
    for order in orders:
        if order["commercial_status"] != "cancelled" and order["fulfillment_status"] != "delivered":
            active_orders += 1
        if order["invoice_requested"]:
            invoice_requested_orders += 1
            
        try:
            r_quotes = await db.execute(text("SELECT final_total, subtotal, deposit_amount, cod_remaining FROM quote_versions WHERE order_id = :order_id ORDER BY version DESC LIMIT 1"), {"order_id": order["id"]})
            quote = r_quotes.mappings().first()
        except Exception:
            quote = None
            
        quote_total = quote["final_total"] if quote else 0
        quote_subtotal = quote["subtotal"] if quote else 0
        
        estimated_sales_vnd += quote_total
        estimated_gross_sales_vnd += quote_subtotal
        discount_and_offer_vnd += max(0, quote_subtotal - quote_total)
        
        try:
            r_pay = await db.execute(text("SELECT amount, status, purpose FROM payment_requests WHERE order_id = :order_id"), {"order_id": order["id"]})
            payments = r_pay.mappings().all()
        except Exception:
            payments = []
            
        for pay in payments:
            if pay["status"] == "active":
                payment_requested_vnd += pay["amount"]
            elif pay["status"] == "paid":
                payment_confirmed_vnd += pay["amount"]
                
    # 2. Read inventory
    inventory_val = 0
    on_hand = 0
    reserved = 0
    defective = 0
    try:
        r_bal = await db.execute(text("SELECT on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd FROM inventory_balances"))
        balances = r_bal.mappings().all()
        for bal in balances:
            on_hand += bal["on_hand_qty"] or 0
            reserved += bal["reserved_qty"] or 0
            defective += bal["defective_qty"] or 0
            inventory_val += (bal["on_hand_qty"] or 0) * (bal["avg_cost_vnd"] or 0)
    except Exception:
        pass
        
    # 3. Read stock reservations
    reserved_expired = 0
    try:
        now = datetime.datetime.utcnow()
        r_res = await db.execute(text("SELECT sum(quantity) FROM stock_reservations WHERE expires_at < :now AND status = 'reserved'"), {"now": now})
        reserved_expired = r_res.scalar() or 0
    except Exception:
        pass

    # 4. Read accounting
    posted_entries = 0
    draft_entries = 0
    debit_total = 0
    credit_total = 0
    try:
        r_ent = await db.execute(text("SELECT status FROM journal_entries"))
        entries = r_ent.mappings().all()
        posted_entries = len([e for e in entries if e["status"] == "posted"])
        draft_entries = len([e for e in entries if e["status"] == "draft"])
        
        r_lines = await db.execute(text("SELECT debit_amount_vnd, credit_amount_vnd FROM journal_lines"))
        lines = r_lines.mappings().all()
        debit_total = sum(l["debit_amount_vnd"] or 0 for l in lines)
        credit_total = sum(l["credit_amount_vnd"] or 0 for l in lines)
    except Exception:
        pass

    # 5. Read receivables
    receivable_open = 0
    receivable_overdue = 0
    try:
        today = datetime.date.today().isoformat()
        r_rec = await db.execute(text("SELECT debit_amount, credit_amount, due_date, status FROM receivable_ledger_entries WHERE status != 'void'"))
        receivables = r_rec.mappings().all()
        for r in receivables:
            bal = (r["debit_amount"] or 0) - (r["credit_amount"] or 0)
            if bal <= 0 or r["status"] == "settled":
                continue
            receivable_open += bal
            if r["due_date"] and str(r["due_date"]) < today:
                receivable_overdue += bal
    except Exception:
        pass

    # 6. Read payables
    payable_open = 0
    payable_overdue = 0
    try:
        today = datetime.date.today().isoformat()
        r_pay_entries = await db.execute(text("SELECT debit_amount, credit_amount, due_date, status FROM payable_ledger_entries WHERE status != 'void'"))
        payables = r_pay_entries.mappings().all()
        for p in payables:
            bal = (p["credit_amount"] or 0) - (p["debit_amount"] or 0)
            if bal <= 0 or p["status"] == "settled":
                continue
            payable_open += bal
            if p["due_date"] and str(p["due_date"]) < today:
                payable_overdue += bal
    except Exception:
        pass

    # 7. Read reconciliation
    reconciled_matched = 0
    reconciled_unmatched = 0
    open_batches = 0
    unmatched_tx = 0
    try:
        r_batch = await db.execute(text("SELECT status, total_matched_amount, total_difference_amount FROM reconciliation_batches"))
        batches = r_batch.mappings().all()
        for b in batches:
            reconciled_matched += b["total_matched_amount"] or 0
            reconciled_unmatched += b["total_difference_amount"] or 0
            if b["status"] in ["open", "reviewing"]:
                open_batches += 1
                
        r_bank = await db.execute(text("SELECT count(id) FROM bank_transactions WHERE reconciliation_status = 'unmatched'"))
        unmatched_tx = r_bank.scalar() or 0
    except Exception:
        pass

    # Append custom alerts
    if invoice_requested_orders > 0:
        alerts.append({
            "severity": "warning",
            "area": "invoice",
            "message": f"{invoice_requested_orders} đơn có yêu cầu xuất hóa đơn; cần module hóa đơn thuế/VAT đầy đủ để báo cáo thuế chính xác."
        })
    if defective > 0:
        alerts.append({
            "severity": "warning",
            "area": "inventory",
            "message": f"Đang có {defective} sản phẩm lỗi cần luồng xử lý: trả NCC, sửa/đóng gói lại, thanh lý hoặc ghi giảm."
        })
    if reserved_expired > 0:
        alerts.append({
            "severity": "warning",
            "area": "inventory",
            "message": f"Có {reserved_expired} sản phẩm đang bị giữ hàng quá hạn. Cần release hoặc gia hạn để tồn khả dụng không bị sai."
        })
    if abs(debit_total - credit_total) > 0:
        alerts.append({
            "severity": "critical",
            "area": "accounting",
            "message": f"Trial balance đang lệch {abs(debit_total - credit_total):,} VND. Không được khóa kỳ cho tới khi xử lý."
        })

    return {
        "alerts": alerts,
        "sales": {
            "activeOrders": active_orders,
            "invoiceRequestedOrders": invoice_requested_orders,
            "estimatedSalesVnd": estimated_sales_vnd,
            "estimatedGrossSalesVnd": estimated_gross_sales_vnd,
            "discountAndOfferVnd": discount_and_offer_vnd,
            "paymentRequestedVnd": payment_requested_vnd,
            "paymentConfirmedVnd": payment_confirmed_vnd,
            "paymentPendingProofVnd": payment_pending_proof_vnd,
            "salesByStatus": [],
            "salesBySupplier": []
        },
        "inventory": {
            "inventoryValueVnd": inventory_val,
            "onHandQty": on_hand,
            "availableQty": max(0, on_hand - reserved - defective),
            "defectiveQty": defective,
            "inventoryBySku": []
        },
        "reservations": {
            "reservationActiveQty": reserved,
            "reservationExpiredQty": reserved_expired,
            "reservationsBySku": []
        },
        "accounting": {
            "postedJournalEntries": posted_entries,
            "draftJournalEntries": draft_entries,
            "trialBalanceDebitVnd": debit_total,
            "trialBalanceCreditVnd": credit_total,
            "trialBalanceDifferenceVnd": abs(debit_total - credit_total),
            "accountingByAccount": []
        },
        "receivables": {
            "receivableOpenVnd": receivable_open,
            "receivableOverdueVnd": receivable_overdue,
            "receivableByCustomer": []
        },
        "payables": {
            "payableOpenVnd": payable_open,
            "payableOverdueVnd": payable_overdue,
            "payableByPartner": []
        },
        "reconciliation": {
            "reconciliationMatchedVnd": reconciled_matched,
            "reconciliationUnmatchedVnd": reconciled_unmatched,
            "openReconciliationBatches": open_batches,
            "unmatchedBankTransactions": unmatched_tx,
            "reconciliationByType": []
        }
    }
