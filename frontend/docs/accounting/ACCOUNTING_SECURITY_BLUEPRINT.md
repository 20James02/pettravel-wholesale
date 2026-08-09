# Accounting Security & Accuracy Blueprint

This blueprint defines the minimum standard for the Pet Travel WholeSale accounting module. The goal is not to imitate spreadsheet behavior; the goal is to make financial results server-authoritative, auditable, and hard to corrupt.

## Non-negotiable invariants

1. Money is stored and calculated as integer VND.
2. Percentages are stored as basis points: `10000 = 100%`, `150 = 1.5%`.
3. All financial calculations run through the server-side accounting engine.
4. Every posted journal entry must satisfy total debit = total credit.
5. Posted accounting entries and confirmed financial records are immutable.
6. Corrections use adjustment or reversal entries, not silent edits.
7. Every sensitive financial action must have actor, timestamp, source, and reason/audit context.
8. Google Sheets, UI tables, exports, and uploaded proofs are supporting evidence, not the accounting source of truth.

## Calculation policy

- Use integer arithmetic only.
- Reject unsafe money values instead of rounding silently.
- Reject negative order totals.
- Reject deposit amounts greater than the final total.
- For deposit/COD orders, require deposit amount to be positive.
- For pay-full orders, payment due now equals the final total and COD remaining equals zero.
- Snapshot quote totals at approval time so later catalog or supplier price changes do not alter historical orders.

## Posting policy

Supported first-wave posting events:

- Deposit confirmed: debit bank/cash, credit customer receivable/advance.
- Sale recognized: debit customer receivable, credit revenue and output VAT; optionally debit COGS and credit inventory.
- COD collected: debit bank/cash, credit customer receivable.

Before posting:

- Validate idempotency key.
- Validate open accounting period.
- Validate actor permission.
- Validate journal balance.
- Validate all referenced source records belong to the expected organization.

After posting:

- Lock entry and lines.
- Write audit log.
- Expose only internal accounting roles through RBAC.

## Security controls

- Server-side RBAC permissions:
  - `accounting.read`
  - `accounting.write`
  - `accounting.post`
  - `accounting.close_period`
  - `accounting.export`
- RLS should keep accounting tables internal-only.
- Admin/service APIs must still enforce application authorization because Supabase service role bypasses RLS.
- Inputs must be allowlist-validated by schema before touching the database.
- Errors returned to users must be safe and should not leak SQL, secrets, or internal stack traces.

## Test gates

Minimum gates before an accounting change is accepted:

- Unit tests for integer money operations.
- Unit tests for quote totals, discounts, shipping fee, freeship, deposit/COD, and pay-full.
- Unit tests for double-entry balancing.
- Unit tests for VAT split and cost-of-goods posting.
- Type-check.
- Lint.
- Build.
- `npm audit`.

## Manual review before production accounting use

Pet Travel should have a Vietnamese accountant review chart-of-accounts mapping, VAT treatment, invoice timing, COGS timing, and statutory report formats before relying on this module as the legal accounting book.
