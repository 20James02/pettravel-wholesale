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

### Posted Entry

A journal entry that has passed validation and has been posted to the accounting books. Posted entries are immutable.

### Reversal Entry

A new journal entry that reverses a previously posted journal entry. Reversal entries are used instead of editing posted entries.

### VND Amount

A Vietnamese Dong money amount stored as an integer with no decimal fraction.
