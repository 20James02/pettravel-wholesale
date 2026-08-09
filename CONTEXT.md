# Pet Travel WholeSale Domain Context

## Glossary

### Accounting Engine

The server-side component that calculates financial totals and creates journal-entry drafts. User interfaces may display results from the engine, but must not become the source of truth for financial calculations.

### Accounting Period

A date range used to group accounting documents and journal entries. Once an accounting period is closed, corrections must be made by new adjustment or reversal entries.

### Financial Snapshot

The immutable financial result attached to an approved quote or payment decision, including subtotal, adjustments, final total, deposit amount, COD remaining amount, and payment due now.

### Journal Entry

A double-entry accounting record made of two or more journal lines. A valid journal entry must have total debit equal to total credit.

### Journal Line

One debit or credit line inside a journal entry. A journal line may debit or credit an amount, but never both at the same time.

### Operations Document

A business document used by warehouse, purchasing, sales, or accounting operations before or alongside accounting posting. Examples include purchase receipts, sales invoices, expense documents, defect reports, and stock adjustments.

### Posted Entry

A journal entry that has passed validation and has been posted to the accounting books. Posted entries are immutable.

### Purchase Receipt

An operations document recording goods received from a supplier. Posting a purchase receipt increases inventory quantity and can later create accounting entries for inventory and payable/cash.

### Reversal Entry

A new journal entry that reverses a previously posted journal entry. Reversal entries are used instead of editing posted entries.

### Stock Movement

An immutable inventory movement that changes warehouse quantity, reserved quantity, or defective quantity for a product variant. Stock movement totals must be derived server-side from an approved operations document.

### Defect Report

An operations document recording damaged, expired, missing, or otherwise unsellable stock. Defect reports move quantity out of available inventory and into defective tracking until the business decides to return, write off, or investigate.

### Inventory Valuation

The monetary value of stock on hand at a reporting date. It must be derived from stock movements and the chosen costing method, not from an editable product display field.

### Reconciliation Batch

A controlled review set that compares system records with an external source such as a bank statement, COD remittance file, supplier invoice, shipping bill, or Google Sheet import. Differences must remain traceable until resolved.

### Tax Invoice

An issued invoice used for VAT/tax reporting. A sales order or operations invoice may request a tax invoice, but tax reporting requires its own immutable invoice number, issue status, tax base, VAT amount, and void/replacement history.

### Accounts Receivable

Amounts the business is entitled to collect from customers after goods, invoices, deposits, COD, shipping fees, discounts, and refunds are recognized.

### Accounts Payable

Amounts the business owes suppliers, shippers, service providers, or staff after purchase receipts, supplier invoices, expenses, discounts, returns, and payments are recognized.

### VND Amount

A Vietnamese Dong money amount stored as an integer with no decimal fraction.
