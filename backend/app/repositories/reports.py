from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _amount(value: Any) -> int:
    return int(value or 0)


async def get_reports_overview(db: AsyncSession, *, organization_id: str) -> dict[str, Any]:
    order_rows = (
        await db.execute(
            text("""with ranked_quotes as (
                select q.*, row_number() over (partition by q.order_id order by q.version desc) as rn
                from quote_versions q
            )
            select o.commercial_status as key,
                   count(*) as quantity,
                   coalesce(sum(q.final_total), 0) as amount_vnd,
                   coalesce(sum(q.subtotal), 0) as gross_vnd,
                   sum(case when o.commercial_status <> 'cancelled'
                                 and o.fulfillment_status <> 'delivered' then 1 else 0 end) as active_count,
                   sum(case when o.commercial_status in ('customer_accepted', 'locked') then 1 else 0 end) as accepted_count,
                   sum(case when o.invoice_requested then 1 else 0 end) as invoice_count
            from customer_orders o
            left join ranked_quotes q on q.order_id = o.id and q.rn = 1
            group by o.commercial_status
            order by o.commercial_status""")
        )
    ).mappings().all()

    supplier_rows = (
        await db.execute(
            text("""select s.id as key, s.name as label,
                   coalesce(sum(oi.quantity), 0) as quantity,
                   coalesce(sum(oi.quantity * oi.unit_price_snapshot), 0) as amount_vnd
            from order_items oi
            join customer_orders o on o.id = oi.order_id and o.commercial_status <> 'cancelled'
            join suppliers s on s.id = oi.supplier_id
            group by s.id, s.name
            order by amount_vnd desc, s.id""")
        )
    ).mappings().all()

    payment = (
        await db.execute(
            text("""select
                coalesce(sum(case when status = 'active' then amount else 0 end), 0) as requested,
                coalesce(sum(case when status = 'confirmed' then amount else 0 end), 0) as confirmed,
                coalesce(sum(case when status = 'uploaded' then amount else 0 end), 0) as pending_proof
            from payment_requests""")
        )
    ).mappings().one()

    inventory_rows = (
        await db.execute(
            text("""select sku as key, sku as label,
                   coalesce(sum(on_hand_qty), 0) as on_hand_qty,
                   coalesce(sum(reserved_qty), 0) as reserved_qty,
                   coalesce(sum(defective_qty), 0) as defective_qty,
                   coalesce(sum(on_hand_qty * avg_cost_vnd), 0) as amount_vnd
            from inventory_balances
            where organization_id = :organization_id
            group by sku
            order by amount_vnd desc, sku"""),
            {"organization_id": organization_id},
        )
    ).mappings().all()

    reservation_rows = (
        await db.execute(
            text("""select sku_snapshot as key, sku_snapshot as label,
                   coalesce(sum(case when status = 'active' then quantity else 0 end), 0) as open_qty,
                   coalesce(sum(case when status = 'active' and expires_at < :today then quantity else 0 end), 0) as expired_qty
            from stock_reservations
            where organization_id = :organization_id
            group by sku_snapshot
            order by open_qty desc, sku_snapshot"""),
            {"organization_id": organization_id, "today": datetime.now(timezone.utc)},
        )
    ).mappings().all()

    journal_counts = (
        await db.execute(
            text("""select
                coalesce(sum(case when status = 'posted' then 1 else 0 end), 0) as posted_count,
                coalesce(sum(case when status = 'draft' then 1 else 0 end), 0) as draft_count
            from journal_entries where organization_id = :organization_id"""),
            {"organization_id": organization_id},
        )
    ).mappings().one()
    account_rows = (
        await db.execute(
            text("""select jl.account_code as key, jl.account_name as label,
                   coalesce(sum(jl.debit_amount), 0) as debit_vnd,
                   coalesce(sum(jl.credit_amount), 0) as credit_vnd
            from journal_lines jl
            join journal_entries je on je.id = jl.entry_id and je.status = 'posted'
            where jl.organization_id = :organization_id
            group by jl.account_code, jl.account_name
            order by jl.account_code"""),
            {"organization_id": organization_id},
        )
    ).mappings().all()

    receivable_rows = (
        await db.execute(
            text("""select coalesce(customer_org_id, customer_name) as key, customer_name as label,
                   coalesce(sum(debit_amount - credit_amount), 0) as amount_vnd,
                   coalesce(sum(case when due_date < :today then debit_amount - credit_amount else 0 end), 0) as overdue_vnd
            from receivable_ledger_entries
            where organization_id = :organization_id and status not in ('settled', 'void')
            group by customer_org_id, customer_name
            order by amount_vnd desc, customer_name"""),
            {"organization_id": organization_id, "today": date.today()},
        )
    ).mappings().all()
    payable_rows = (
        await db.execute(
            text("""select coalesce(supplier_id, partner_name) as key, partner_name as label,
                   coalesce(sum(credit_amount - debit_amount), 0) as amount_vnd,
                   coalesce(sum(case when due_date < :today then credit_amount - debit_amount else 0 end), 0) as overdue_vnd
            from payable_ledger_entries
            where organization_id = :organization_id and status not in ('settled', 'void')
            group by supplier_id, partner_name
            order by amount_vnd desc, partner_name"""),
            {"organization_id": organization_id, "today": date.today()},
        )
    ).mappings().all()
    reconciliation_rows = (
        await db.execute(
            text("""select type as key, type as label, count(*) as quantity,
                   coalesce(sum(total_matched_amount), 0) as amount_vnd,
                   coalesce(sum(total_difference_amount), 0) as secondary_amount_vnd,
                   sum(case when status in ('open', 'reviewing') then 1 else 0 end) as open_count
            from reconciliation_batches
            where organization_id = :organization_id and status <> 'void'
            group by type order by type"""),
            {"organization_id": organization_id},
        )
    ).mappings().all()
    unmatched_bank_transactions = _amount(
        (
            await db.execute(
                text("""select count(*) from bank_transactions
                    where organization_id = :organization_id and reconciliation_status = 'unmatched'"""),
                {"organization_id": organization_id},
            )
        ).scalar()
    )

    total_orders = sum(_amount(row["quantity"]) for row in order_rows)
    active_orders = sum(_amount(row["active_count"]) for row in order_rows)
    accepted_orders = sum(_amount(row["accepted_count"]) for row in order_rows)
    invoice_orders = sum(_amount(row["invoice_count"]) for row in order_rows)
    estimated_sales = sum(_amount(row["amount_vnd"]) for row in order_rows)
    estimated_gross = sum(_amount(row["gross_vnd"]) for row in order_rows)
    on_hand = sum(_amount(row["on_hand_qty"]) for row in inventory_rows)
    reserved = sum(_amount(row["reserved_qty"]) for row in inventory_rows)
    defective = sum(_amount(row["defective_qty"]) for row in inventory_rows)
    inventory_value = sum(_amount(row["amount_vnd"]) for row in inventory_rows)
    reservation_open = sum(_amount(row["open_qty"]) for row in reservation_rows)
    reservation_expired = sum(_amount(row["expired_qty"]) for row in reservation_rows)
    debit_total = sum(_amount(row["debit_vnd"]) for row in account_rows)
    credit_total = sum(_amount(row["credit_vnd"]) for row in account_rows)
    receivable_open = sum(max(0, _amount(row["amount_vnd"])) for row in receivable_rows)
    receivable_overdue = sum(max(0, _amount(row["overdue_vnd"])) for row in receivable_rows)
    payable_open = sum(max(0, _amount(row["amount_vnd"])) for row in payable_rows)
    payable_overdue = sum(max(0, _amount(row["overdue_vnd"])) for row in payable_rows)
    reconciliation_matched = sum(_amount(row["amount_vnd"]) for row in reconciliation_rows)
    reconciliation_unmatched = sum(_amount(row["secondary_amount_vnd"]) for row in reconciliation_rows)
    open_batches = sum(_amount(row["open_count"]) for row in reconciliation_rows)

    alerts: list[dict[str, str]] = []
    if invoice_orders:
        alerts.append({"severity": "warning", "area": "invoice", "message": f"Có {invoice_orders} đơn yêu cầu xuất hóa đơn."})
    if defective:
        alerts.append({"severity": "warning", "area": "inventory", "message": f"Có {defective} sản phẩm lỗi cần xử lý."})
    if reservation_expired:
        alerts.append({"severity": "warning", "area": "inventory", "message": f"Có {reservation_expired} sản phẩm giữ chỗ đã quá hạn."})
    if debit_total != credit_total:
        alerts.append({"severity": "critical", "area": "accounting", "message": f"Trial balance lệch {abs(debit_total - credit_total):,} VND."})

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "basis": "mixed_operational_estimate",
        "kpis": {
            "totalOrders": total_orders,
            "activeOrders": active_orders,
            "acceptedOrders": accepted_orders,
            "invoiceRequestedOrders": invoice_orders,
            "estimatedSalesVnd": estimated_sales,
            "estimatedGrossSalesVnd": estimated_gross,
            "discountAndOfferVnd": max(0, estimated_gross - estimated_sales),
            "paymentRequestedVnd": _amount(payment["requested"]),
            "paymentConfirmedVnd": _amount(payment["confirmed"]),
            "paymentPendingProofVnd": _amount(payment["pending_proof"]),
            "receivableOpenVnd": receivable_open,
            "receivableOverdueVnd": receivable_overdue,
            "payableOpenVnd": payable_open,
            "payableOverdueVnd": payable_overdue,
            "reconciliationMatchedVnd": reconciliation_matched,
            "reconciliationUnmatchedVnd": reconciliation_unmatched,
            "openReconciliationBatches": open_batches,
            "unmatchedBankTransactions": unmatched_bank_transactions,
            "inventoryValueVnd": inventory_value,
            "onHandQty": on_hand,
            "availableQty": max(0, on_hand - reserved - defective),
            "defectiveQty": defective,
            "reservationOpenQty": reservation_open,
            "reservationExpiredQty": reservation_expired,
            "postedJournalEntries": _amount(journal_counts["posted_count"]),
            "draftJournalEntries": _amount(journal_counts["draft_count"]),
            "trialBalanceDebitVnd": debit_total,
            "trialBalanceCreditVnd": credit_total,
            "trialBalanceDifferenceVnd": abs(debit_total - credit_total),
        },
        "salesByStatus": [
            {"key": row["key"], "label": row["key"], "quantity": _amount(row["quantity"]), "amountVnd": _amount(row["amount_vnd"])}
            for row in order_rows
        ],
        "salesBySupplier": [
            {"key": row["key"], "label": row["label"], "quantity": _amount(row["quantity"]), "amountVnd": _amount(row["amount_vnd"])}
            for row in supplier_rows
        ],
        "receivableByCustomer": [
            {"key": row["key"], "label": row["label"], "amountVnd": _amount(row["amount_vnd"]), "secondaryAmountVnd": _amount(row["overdue_vnd"])}
            for row in receivable_rows
        ],
        "payableByPartner": [
            {"key": row["key"], "label": row["label"], "amountVnd": _amount(row["amount_vnd"]), "secondaryAmountVnd": _amount(row["overdue_vnd"])}
            for row in payable_rows
        ],
        "reconciliationByType": [
            {"key": row["key"], "label": row["label"], "quantity": _amount(row["quantity"]), "amountVnd": _amount(row["amount_vnd"]), "secondaryAmountVnd": _amount(row["secondary_amount_vnd"])}
            for row in reconciliation_rows
        ],
        "reservationsBySku": [
            {"key": row["key"], "label": row["label"], "quantity": _amount(row["open_qty"]), "amountVnd": 0, "secondaryAmountVnd": _amount(row["expired_qty"])}
            for row in reservation_rows
        ],
        "inventoryBySku": [
            {"key": row["key"], "label": row["label"], "quantity": _amount(row["on_hand_qty"]), "amountVnd": _amount(row["amount_vnd"]), "secondaryAmountVnd": _amount(row["reserved_qty"])}
            for row in inventory_rows
        ],
        "accountingByAccount": [
            {"key": row["key"], "label": row["label"], "amountVnd": _amount(row["debit_vnd"]), "secondaryAmountVnd": _amount(row["credit_vnd"])}
            for row in account_rows
        ],
        "alerts": alerts,
    }
