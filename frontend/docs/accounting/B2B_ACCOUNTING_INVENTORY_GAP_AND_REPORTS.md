# Pet Travel WholeSale - B2B Accounting, Inventory, Invoice, and Reconciliation Gap Analysis

Last updated: 2026-08-09

## Executive assessment

Pet Travel WholeSale currently has a good starting foundation for B2B wholesale operations:

- Admin-created accounts and internal role permissions.
- Order quote snapshots, deposit/COD or full-payment intent, QR/payment proof workflow.
- Supplier split visibility for Admin while customers see Pet Travel as the only supplier identity.
- Accounting primitives: accounting periods, chart of accounts, journal entries, journal lines, double-entry validation, posted-entry immutability.
- Operations primitives: purchase receipt, sales invoice, expense document, defect report, stock adjustment, stock movements, inventory balances.

The platform is not yet equivalent to a professional accounting and inventory suite such as MISA. The current implementation is best classified as "foundation ready, business coverage incomplete." The biggest missing layer is not UI decoration; it is the controlled connection between orders, warehouse documents, invoices, payments, COD, bank reconciliation, receivables, payables, tax invoices, and accounting journal posting.

## Current evidence from the codebase

### Implemented foundation

| Area | Current implementation | Evidence |
| --- | --- | --- |
| Money safety | Integer VND validation and basis-point percentage math exist. | `src/server/accounting/engine.ts` |
| Double-entry accounting | Journal drafts require debit total equals credit total. | `assertBalancedJournalEntry` |
| Posted accounting immutability | Posted journal entries and lines are protected by database triggers. | `supabase/update_v3_accounting.sql` |
| Accounting overview | Counts periods and journal entries, lists recent entries. | `src/server/accounting/repository.ts` |
| Operations documents | Purchase receipt, sales invoice, expense, defect report, stock adjustment. | `supabase/update_v4_operations.sql` |
| Inventory balances | Tracks on-hand, reserved, defective, average cost by warehouse and SKU. | `inventory_balances` |
| Stock movement ledger | Posted operations documents create stock movements. | `stock_movements` |
| Admin UI entry | Admin has "Kho & Mua hàng" and "Kế toán" tabs. | `src/features/pettravel/PetTravelApp.tsx` |

### Important limitations discovered

| Severity | Gap | Why it matters |
| --- | --- | --- |
| Critical | Operations posting is not wrapped in a single database transaction/RPC. | A partial failure can create an operations document without all lines, inventory updates, or stock movements. Financial systems need atomic posting. |
| Critical | Operations documents do not automatically create accounting journal entries. | Inventory, revenue, COGS, receivables, payables, VAT, shipping revenue/cost, discounts, and expenses will not reach accounting books automatically. |
| Critical | Customer order lifecycle is not yet tied to reserved stock, shipment, invoice, COD, and receivable balance. | Reports can disagree: product stock, inventory balances, orders, invoices, and payments may drift. |
| Critical | No formal bank/COD/supplier reconciliation module. | Payment proof upload and admin confirmation are not enough for accounting-grade reconciliation. |
| High | No accounts receivable ledger by customer/order/invoice. | Cannot reliably report customer debt, overdue debt, deposit balance, COD remaining, refunds. |
| High | No accounts payable ledger by supplier/shipper/expense vendor. | Cannot report supplier debt, purchase payable, shipping payable, unpaid expenses. |
| High | Tax invoice model is too simple. | VAT output/input reporting needs invoice number, issue date, tax base, VAT amount, replacement/void history, tax code fields. |
| High | Inventory costing is only a simple moving-average balance calculation. | Needs costing method policy, historical valuation, COGS by sale, negative-stock prevention, and audit trail. |
| High | Product variant `stock` still exists separately from `inventory_balances`. | Two stock sources can diverge. Product display should derive availability from warehouse balances/reservations. |
| High | No stock reservation/release workflow. | Admin cannot know whether inventory is free, held for pending orders, packed, shipped, or backordered. |
| High | Defective goods are tracked but not resolved. | Need return-to-supplier, write-off, repair/repack, liquidation, insurance/compensation, and accounting impact. |
| Medium | No multi-warehouse transfer flow. | Needed when Pet Travel has multiple storage points, shipping staging, or supplier-direct fulfillment. |
| Medium | No document approval workflow. | Draft/post is not enough for purchase, expense, write-off, discount, refund, and stock adjustment approval. |
| Medium | No import/export contracts for Google Sheets. | Sheets should be an input/output channel with validation, not the accounting source of truth. |
| Medium | No period-end close checklist. | Need lock period, unresolved reconciliation checks, inventory close, AR/AP aging, trial balance checks. |

## Required business capability map

### 1. Sales order to accounting

Required flow:

1. Customer submits order.
2. Admin reviews, applies discount/freeship/offer/shipping fee.
3. Server creates quote version and financial snapshot.
4. Customer accepts quote.
5. System reserves stock per SKU/warehouse or marks backorder.
6. Admin requests deposit or full payment.
7. Customer uploads proof.
8. Accountant confirms bank money received.
9. Warehouse packs and ships.
10. Admin updates tracking and shipping fee.
11. Delivery/COD collected if applicable.
12. System recognizes revenue, receivable, VAT, COGS, inventory reduction, and payment clearing.

Missing data/actions:

- `stock_reservations`
- `order_fulfillment_lines`
- `invoice_requests`
- `sales_invoice_lines`
- `receivable_ledger`
- `payment_allocations`
- `shipping_charge_snapshots`
- automatic journal posting from order/payment/shipment events

### 2. Purchasing and supplier payable

Required flow:

1. Create purchase order or expected receipt.
2. Receive goods by SKU, quantity, warehouse, supplier, unit cost.
3. Record quantity difference and damaged goods on receipt.
4. Match supplier invoice against receipt.
5. Recognize inventory and accounts payable.
6. Pay supplier partially or fully.
7. Reconcile supplier debt.

Missing data/actions:

- `purchase_orders`
- `purchase_order_lines`
- `supplier_invoices`
- `supplier_payments`
- `payable_ledger`
- 2-way/3-way match: purchase order vs receipt vs supplier invoice
- supplier return and debit note

### 3. Warehouse and inventory control

Required flow:

- Receive stock.
- Reserve stock for accepted orders.
- Pick/pack/ship stock.
- Transfer stock between warehouses.
- Count stock physically.
- Adjust shrinkage/gain with approval.
- Track defective/expired/damaged stock.
- Resolve defective stock through write-off, return, repair, or resale.

Missing data/actions:

- reservation movement type
- pick/pack status per SKU line
- physical stock count sessions
- stock count variance approval
- warehouse transfer documents
- lot/batch/expiry when needed
- barcode/label scanning contract
- minimum stock/reorder point

### 4. Expenses and cash/bank

Required flow:

- Create expense request.
- Attach receipt/proof.
- Approve expense.
- Pay by cash/bank/COD offset.
- Post to expense account and payable/cash/bank.
- Reconcile with bank/cashbook.

Missing data/actions:

- expense approval status
- expense vendor/person
- payment method and bank/cash account
- attachment verification status
- expense account mapping
- recurring expenses

### 5. Tax invoice and VAT

Required flow:

- Customer requests invoice.
- Admin/accountant issues VAT invoice with tax fields.
- Invoice can be issued, replaced, adjusted, or voided.
- VAT output/input reports derive from issued tax invoices and supplier invoices.

Missing data/actions:

- tax profile per customer/supplier
- VAT rate per product/service line
- invoice symbol/series/template fields
- invoice issue provider/integration status
- void/replacement/adjustment link
- VAT declaration report

### 6. Reconciliation

Required reconciliation types:

- Bank statement vs payment requests/proofs.
- COD remittance vs delivered COD orders.
- Shipping bill vs shipping fees charged/paid.
- Supplier invoice vs purchase receipt.
- Inventory balance vs stock movements vs physical count.
- Accounting trial balance vs subledgers.
- Google Sheet import/export vs database canonical records.

Missing data/actions:

- `reconciliation_batches`
- `reconciliation_items`
- matching rules and confidence score
- manual match/unmatch
- unresolved difference reason
- write-off/adjustment creation from reconciliation
- audit log for each resolution

## Report catalogue and exact output definitions

These reports should be built from canonical tables only. Google Sheets can receive exported output, but it must not become the primary accounting database.

### A. Executive dashboard

| Report | Output fields | Formula/source | Priority |
| --- | --- | --- | --- |
| Daily B2B revenue summary | date, orders, gross sales, discounts, shipping fees, net revenue, VAT, COGS, gross profit, gross margin | accepted/fulfilled sales invoices + journal lines | P0 |
| Cash collected today | date, bank collected, COD collected, cash collected, unmatched receipts | confirmed payment allocations + bank/COD reconciliation | P0 |
| Open operational risk | pending orders, pending deposits, unshipped orders, unresolved defects, negative/low stock warnings | order, payment, operations, inventory | P0 |

### B. Sales and order reports

| Report | Output fields | Accuracy rule |
| --- | --- | --- |
| Sales by customer | customer, orders, net sales, paid, receivable, overdue, last order date | Derive from invoices/receivables, not cart totals. |
| Sales by SKU | SKU, product, quantity sold, net sales, COGS, gross profit, margin | Quantity from posted sale stock movements; revenue from issued sales invoices. |
| Sales by supplier | supplier, SKU count, sales, COGS, gross profit | Customer sees Pet Travel only; supplier report is Admin-only. |
| Quote conversion | submitted orders, quoted, accepted, cancelled, average approval time | Use order status transitions and quote versions. |
| Discount/freeship impact | order, customer, operator, discount, freeship, offer, approval status, gross margin after discount | Use quote financial snapshots. |

### C. Accounts receivable reports

| Report | Output fields | Accuracy rule |
| --- | --- | --- |
| Customer debt aging | customer, invoice/order, due date, 0-30, 31-60, 61-90, >90 days, total due | Invoice total minus allocated payments/refunds/credits. |
| Deposit/COD balance | order, deposit requested, deposit paid, COD remaining, COD collected, remaining due | Payment requests and allocations must reconcile to receivable ledger. |
| Payment proof exception | proof uploaded, amount expected, amount detected/entered, bank matched, status, reviewer | Proof upload never equals confirmed cash. |

### D. Purchasing and payable reports

| Report | Output fields | Accuracy rule |
| --- | --- | --- |
| Purchase receipts by supplier | supplier, receipt no, SKU, qty received, unit cost, total cost, warehouse | Posted purchase receipts only for stock quantity. |
| Supplier debt aging | supplier, invoice, due date, 0-30, 31-60, 61-90, >90, total due | Supplier invoice minus supplier payments/returns/debit notes. |
| Supplier price variance | SKU, supplier, last cost, average cost, current supplier price, variance | Compare purchase receipts and active catalog cost/prices. |
| Receipt-invoice mismatch | purchase order, receipt, supplier invoice, quantity diff, amount diff | 2-way/3-way match. |

### E. Inventory and warehouse reports

| Report | Output fields | Accuracy rule |
| --- | --- | --- |
| Inventory valuation | warehouse, SKU, on hand, reserved, defective, available, avg cost, inventory value | on_hand * costing method at report date. |
| Stock card | SKU, opening qty, movements in/out, reserved changes, defective changes, closing qty | Derived from stock movement ledger. |
| Low-stock/reorder | SKU, available qty, reorder point, average daily sales, suggested reorder qty | Needs reorder policy and sales velocity. |
| Defective goods report | SKU, qty defective, reason, source document, responsible party, resolution status, estimated loss | Defect reports plus resolution documents. |
| Stock count variance | count session, SKU, system qty, counted qty, variance qty/value, approval status | Physical count session vs locked system snapshot. |
| Inventory turnover | SKU/category/supplier, COGS, average inventory, turnover, days inventory outstanding | COGS / average inventory. |

### F. Invoice and VAT reports

| Report | Output fields | Accuracy rule |
| --- | --- | --- |
| Issued invoice list | invoice no, customer, tax code, issue date, net amount, VAT, total, status | Tax invoice table, not order note. |
| VAT output | period, invoice, tax base, VAT rate, VAT amount | Issued sales tax invoices only. |
| VAT input | period, supplier invoice, tax base, VAT rate, VAT amount | Verified supplier invoices only. |
| Invoice exception | requested but not issued, issued but unpaid, void/replaced/adjusted | Invoice request and tax invoice status history. |

### G. Accounting reports

| Report | Output fields | Accuracy rule |
| --- | --- | --- |
| Trial balance | account code, account name, opening debit/credit, period debit/credit, closing debit/credit | Posted journal lines only. |
| General ledger | account, date, entry no, source document, debit, credit, running balance | Posted journal lines ordered by period/date. |
| Profit and loss | revenue, discounts, COGS, gross profit, expenses, net profit | Posted journal lines mapped to account types. |
| Balance sheet | assets, liabilities, equity, retained earnings | Posted journal balances at date. |
| Cashbook/bankbook | account, receipt/payment, source, amount, balance, reconciliation status | Cash/bank accounts plus reconciliation batches. |
| Period close checklist | unposted entries, unmatched payments, negative stock, unresolved defects, unissued invoices, trial balance imbalance | Must be all clear before closing period. |

### H. Reconciliation reports

| Report | Output fields | Accuracy rule |
| --- | --- | --- |
| Bank reconciliation | bank transaction, payment request, order, matched amount, difference, status | External statement import matched to internal payments. |
| COD reconciliation | carrier, remittance batch, order, COD expected, COD received, fee deducted, difference | Delivered COD orders matched to remittance. |
| Shipping cost reconciliation | carrier bill, order shipment, charged to customer, paid to carrier, profit/loss | Shipment and carrier invoice matching. |
| Google Sheet export audit | export id, exported rows, checksum, actor, created_at, target sheet | Sheet is output channel, not source of truth. |

## Data model additions required

### P0 - must build before relying on reports

- `stock_reservations`
- `sales_invoices` and `sales_invoice_lines` or expanded `business_invoices`
- `receivable_ledger`
- `payment_allocations`
- `bank_accounts`
- `bank_transactions`
- `reconciliation_batches`
- `reconciliation_items`
- `operation_posting_rpc` database function for atomic posting
- `accounting_posting_rules`

### P1 - professional inventory and purchasing

- `purchase_orders`
- `purchase_order_lines`
- `supplier_invoices`
- `supplier_payments`
- `payable_ledger`
- `warehouse_transfers`
- `stock_count_sessions`
- `stock_count_lines`
- `defect_resolutions`
- `inventory_cost_layers` if FIFO/LIFO/batch costing is required later

### P2 - tax, audit, and integration maturity

- `tax_profiles`
- `tax_invoices`
- `tax_invoice_lines`
- `document_attachments`
- `approval_workflows`
- `audit_events`
- `google_sheet_exports`
- `google_sheet_import_batches`
- `report_snapshots`

## Accounting posting rules required

### Deposit received

- Dr 1121 Bank
- Cr 131 Customer receivable / customer advance depending chosen accounting policy

### Sales invoice issued

- Dr 131 Customer receivable
- Cr 511 Revenue
- Cr 33311 VAT output if VAT applies

### COGS recognized

- Dr 632 Cost of goods sold
- Cr 156 Inventory

### COD collected

- Dr 1111/1121 Cash or bank
- Cr 131 Customer receivable

### Purchase receipt with supplier invoice

- Dr 156 Inventory
- Dr 1331 VAT input if VAT applies
- Cr 331 Supplier payable

### Supplier payment

- Dr 331 Supplier payable
- Cr 1121 Bank

### Expense incurred and paid

- Dr 641/642/627 Expense account
- Dr 1331 VAT input if applicable
- Cr 1111/1121/331 Cash, bank, or payable

### Defective goods write-off

- Dr 632/811 Loss or COGS adjustment
- Cr 156 Inventory

## Accuracy and safety invariants

The implementation must enforce these rules before any report is trusted:

1. Every money amount is integer VND.
2. Every posted accounting entry is balanced.
3. Posted journal entries and posted operations documents are immutable.
4. Historical correction uses reversal or adjustment, not direct edit.
5. Order totals come from server-side financial snapshots.
6. Stock availability equals on hand minus reserved minus defective.
7. Product display stock must not be a second source of truth.
8. Payment proof does not equal collected money until reconciled/confirmed.
9. Bank/COD/supplier reconciliation differences stay open until resolved.
10. Period close is blocked by unposted entries, unmatched cash, negative stock, unresolved defects, and unissued requested invoices.
11. Customer-facing data never exposes internal supplier split.
12. Google Sheets import/export has checksum, actor, timestamp, and validation results.

## Recommended implementation sequence

### Phase 1 - Canonical reporting base

1. Add report domain types and APIs for date range filtering.
2. Add read-only report endpoints:
   - `/api/admin/reports/executive`
   - `/api/admin/reports/sales`
   - `/api/admin/reports/inventory`
   - `/api/admin/reports/accounting/trial-balance`
3. Add report UI tab with date range, export action placeholder, and warning badges for missing migration/data.
4. Add tests for report formulas with deterministic fixtures.

### Phase 2 - Tie orders to stock and receivables

1. Add stock reservation when customer accepts quote.
2. Release reservation on cancellation/expiry.
3. Convert shipment to posted sale stock movement.
4. Create receivable ledger and payment allocation.
5. Make deposit/COD reports derive from receivable ledger.

### Phase 3 - Atomic operations posting

1. Replace multi-step Supabase JS posting with database RPC transaction.
2. Add posting rule engine from operations document to journal entries.
3. Add idempotency key per posting operation.
4. Add approval workflow for expenses, discounts, stock adjustments, write-offs.

### Phase 4 - Reconciliation

1. Add bank/COD/supplier/shipping reconciliation batches.
2. Add import templates for bank and carrier data.
3. Add match rules and manual resolution.
4. Add exception reports.

### Phase 5 - Professional accounting close

1. Add general ledger, trial balance, P&L, balance sheet, cashbook/bankbook.
2. Add period close checks.
3. Add report snapshots and export audit.
4. Add Google Sheets export/import contracts.

## Acceptance checklist for the next coding slices

- [ ] Every report has a declared source table and formula.
- [ ] Every financial report uses posted entries or immutable snapshots.
- [ ] Every inventory report reconciles balances back to stock movements.
- [ ] Every reconciliation report shows matched, unmatched, over/under, and manually resolved amounts.
- [ ] Every API checks server-side RBAC.
- [ ] Every mutation has idempotency and audit trail.
- [ ] Tests cover normal, boundary, mismatch, and permission-denied cases.
- [ ] Production verification separates unauthenticated route checks from authenticated Admin checks.
