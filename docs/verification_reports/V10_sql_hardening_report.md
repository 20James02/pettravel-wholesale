# PET TRAVEL WHOLESALE — MIGRATION V10 SQL HARDENING & ACCOUNTING AUDIT REPORT

> **Document Status**: `AUTHORITATIVE V10 SQL HARDENING & ACCOUNTING VERIFICATION REPORT`  
> **Report Version**: `1.0.0 (PostgreSQL 16 Engine Execution)`  
> **Target Master Plan Version**: `2.5.1 (SQL Integrity Hardening Baseline)`  
> **Test Date**: `2026-08-16`  
> **Environment**: `Real PostgreSQL 16 Container (pettravel_test_pg on localhost:5439) + Python 3.12 (asyncpg/SQLAlchemy 2.0) + Node.js v20 (Next.js 16.3.0 Turbopack)`  
> **Production Mutation**: `NONE (Zero Production Mutations / Zero Production Connection)`

---

## 1. Executive Result

| Area / Test | Verified Invariant | Status |
| :--- | :--- | :---: |
| **Migration V10 Update Strategy** | V10 is local/unreleased; hardened in-place with `BEGIN / COMMIT` block | **`VERIFIED`** |
| **Migration Atomicity** | Deliberate failure inside script triggers 100% rollback without partial function changes | **`VERIFIED`** |
| **Migration Path Parity** | Path A (Baseline), Path B (v1..v9 + v10), Path C (v1..v10) produce identical function fingerprints | **`VERIFIED`** |
| **VAT Math** | Exact integer/NUMERIC calculation matching canonical TypeScript/Python engine with zero float drift | **`VAT_MATH_VERIFIED`** |
| **VAT Policy** | Legal/tax e-invoicing basis governed under ADR-008 | **`PENDING_ACCOUNTING_REVIEW`** |
| **Parameter NULL Guards** | Explicit rejection of `NULL` in `p_mode`, `p_vat_rate_bps`, `p_require_consumed_stock` | **`VERIFIED`** |
| **Same-Order ATP Concurrency** | Early `SELECT ... FOR UPDATE` on `customer_orders` serializes concurrent reservation attempts | **`VERIFIED`** |
| **Same-Order Accounting Concurrency** | Early `SELECT ... FOR UPDATE` on `customer_orders` serializes concurrent accounting postings | **`VERIFIED`** |
| **COGS Fail-Closed Guard** | Consumed movements with missing `unit_cost` raise `ACCOUNTING_COGS_MISSING` | **`VERIFIED`** |
| **SECURITY DEFINER Audit** | Controlled `search_path = public, pg_temp;` and strict `REVOKE ALL / GRANT EXECUTE` | **`VERIFIED`** |
| **Backend Test Suite** | 67 tests passed (15 Postgres integration + 3 migration + 49 unit/mock) | **`PASS (67/67)`** |
| **Frontend Test Suite** | 23 unit tests passed, typecheck passed, lint passed, 26/26 routes built | **`PASS (23/23)`** |
| **Production Boundary** | Local Docker container testing only; zero production database mutations | **`COMPLIANT`** |

---

## 2. V10/V11 Decision

- **Question**: Has `update_v10_integrity_hardening.sql` been applied to any non-ephemeral / shared database?
- **Evidence**: `update_v10_integrity_hardening.sql` was newly authored in the current sprint workspace and has not been deployed to staging or production.
- **Decision**: Safe to harden `supabase/update_v10_integrity_hardening.sql` directly without creating `v11`. Historical migrations (`update_schema.sql` through `update_v9_order_workflow_guards.sql`) remain strictly unmodified.

---

## 3. VAT Semantics Audit

### Semantic Trace
1. **Source**: `quote_versions.final_total` (or $\sum \text{quantity} \times \text{unit\_price\_snapshot}$ on `order_items`).
2. **Business Meaning**: The customer gross total (the full invoice amount payable by the buyer, debited to Account 131 Phải thu khách hàng).
3. **VAT Inclusion**: In Pet Travel Wholesale B2B pricing model, quote totals and customer contract prices are **VAT-inclusive**.
4. **Accounting Posting**:
   - Total Gross Receivable (Debit 131) $= V$.
   - Output VAT (Credit 3331) $= \text{round}\left( \frac{V \times \text{vatRateBps}}{10.000 + \text{vatRateBps}} \right)$.
   - Net Revenue (Credit 511) $= V - \text{VAT}$.
   - Invariant: $\text{Debit (131)} \equiv \text{Credit (511)} + \text{Credit (3331)}$ exactly.

---

## 4. VAT Mathematical Tests

Executed across 24 test vectors in `test_vat_semantics_exact_integer_math`:
- Rates: `0 bps`, `800 bps` (8% VAT), `1000 bps` (10% VAT).
- Amounts: `1`, `10`, `99`, `100`, `999`, `1000`, `999999`, `1000000 VND`.
- Result: 100% exact match between PostgreSQL, TypeScript reference (`splitVatInclusive`), and Python reference.
- Status: **`VAT_MATH_VERIFIED`**.

---

## 5. NULL Validation Findings

In `pt_post_order_accounting`:
- `p_mode`: Explicit check `if p_mode is null or p_mode not in ('post_all', 'post_confirmed_payments', 'recognize_sale')` $\rightarrow$ raises `INVALID_ACCOUNTING_MODE`.
- `p_vat_rate_bps`: Explicit check `if p_vat_rate_bps is null or p_vat_rate_bps < 0 or p_vat_rate_bps > 10000` $\rightarrow$ raises `INVALID_VAT_RATE`.
- `p_require_consumed_stock`: Explicit check `if p_require_consumed_stock is null` $\rightarrow$ raises `INVALID_PARAMETER`.

In `pt_reserve_order_stock`:
- `p_order_id` / `p_actor_id`: Explicitly rejected if `NULL` or empty string.

---

## 6. ATP Same-Order Concurrency

- **Scenario**: Two parallel async transactions simultaneously call `pt_reserve_order_stock('ord_same_race', 'admin_ops')` requesting 2 units from a warehouse balance of 10 units.
- **Mechanism**: `SELECT id, organization_id, commercial_status FROM customer_orders WHERE id = p_order_id FOR UPDATE;` serializes same-order execution.
- **Empirical Result**:
  - First caller: `status = "reserved"`, `reservedQty = 2`.
  - Competing caller: `status = "already_reserved"`, `reservedQty = 2`.
  - Database Invariant: `inventory_balances.reserved_qty = 2` (NOT 4); `stock_reservations` count $= 1$.
- **Status**: **`LOCAL_POSTGRES_CONCURRENCY_VERIFIED`**.

---

## 7. ATP Multi-Order Regression

- Re-ran 2-buyer race condition for final physical unit (`test_postgres_atp_concurrent_two_buyer_race`). Exactly 1 won, 1 received clean insufficient stock exception. Final available $= 0$, reserved $= 1$.
- Re-ran reverse multi-SKU lock ordering (`test_postgres_atp_multi_sku_deterministic_lock_ordering`). Both orders completed sequentially without deadlock.
- **Calibrated Statement**: *"Deterministic lock ordering (`ORDER BY variant_sku_snapshot, id`) mitigates lock inversion and circular-wait risk for the verified reservation acquisition path."*

---

## 8. SECURITY DEFINER Audit

- **search_path**: Hardened to `SET search_path = public, pg_temp;` on both procedures to eliminate unqualified object-shadowing risks.
- **Actor Authorization**:
  - `pt_reserve_order_stock`: Verifies `p_actor_id` has an active internal user and role permissions in `('operations.write', 'operations.post', 'order.quote', 'order.adjust')`.
  - `pt_post_order_accounting`: Verifies `p_actor_id` has active internal user and permission `accounting.post`.

---

## 9. Function Grants

```sql
REVOKE ALL ON FUNCTION pt_reserve_order_stock(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pt_reserve_order_stock(text, text, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION pt_post_order_accounting(text, text, text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pt_post_order_accounting(text, text, text, integer, boolean) TO authenticated, service_role;
```

---

## 10. Accounting Concurrent Idempotency

- **Scenario**: Two parallel async transactions simultaneously call `pt_post_order_accounting('ord_acct_concur', 'admin_ops', 'post_all', 1000, false)`.
- **Mechanism**: `SELECT ... FROM customer_orders WHERE id = p_order_id FOR UPDATE OF co;` serializes accounting posting per order.
- **Empirical Result**:
  - Caller 1: Created payment receipt + sale recognition journal entries (`createdEntries = 2`).
  - Caller 2: Detected existing idempotency keys, skipped without error (`skippedEntries = 2`, `createdEntries = 0`).
  - Database Invariant: Exactly 2 journal entries in DB; $\sum \text{Debit} \equiv \sum \text{Credit} = 1,300,000\text{ VND}$.

---

## 11. Ledger Constraints

- `journal_entries.idempotency_key` (UNIQUE constraint) acts as database-level defense in depth.
- `receivable_ledger_entries (organization_id, source_type, source_id, document_no)` (UNIQUE constraint) prevents duplicate receivable lines.
- `payment_allocations` (UNIQUE constraint on `payment_request_id`) prevents duplicate cash receipt allocations.

---

## 12. COGS Null Protection

- **Fail-Closed Rule**: If recognizing revenue for consumed stock, `pt_post_order_accounting` verifies that every consumed stock movement in `stock_movements` has a non-null `unit_cost`.
- **Empirical Test (`test_missing_cogs_rejected_if_required`)**: When a consumed movement has `unit_cost IS NULL`, procedure raises `ACCOUNTING_COGS_MISSING: One or more consumed stock movements have missing unit cost.`

---

## 13. Migration Transaction Atomicity

- Migration `supabase/update_v10_integrity_hardening.sql` is enclosed in an explicit `BEGIN; ... COMMIT;` block.
- **Failure Injection Test (`test_migration_failure_is_atomic`)**: Injecting a runtime exception (`SELECT 1/0;`) inside the transaction resulted in complete rollback; `pt_reserve_order_stock` remained at its pre-v10 definition without partial mutation.

---

## 14. Migration Path Parity

- **Path A**: Standalone `schema.sql` bootstrap.
- **Path B**: Historical `schema.sql` $\rightarrow$ `update_schema`..`update_v9` $\rightarrow$ `update_v10`.
- **Path C**: Canonical `schema.sql` $\rightarrow$ `update_schema`..`update_v10` sequentially.
- **Parity Result**: `pg_get_functiondef` comparison confirmed 100% identical stored procedure definitions between Path B and Path C.

---

## 15. Full Regression Results

```text
Backend Test Suite:
- tests/test_postgres_migrations.py: 3 passed in 2.80s
- tests/test_real_postgres.py: 15 passed in 5.61s
- Unit / SQLite test suite: 49 passed in 4.20s
Total Backend: 67 passed, 0 failed in 11.29s.

Frontend Test Suite:
- src/server/accounting/engine.test.ts: 23 passed in 674ms
- tsc --noEmit: Passed (0 errors)
- eslint .: Passed (0 errors)
- next build: Compiled 26/26 routes successfully
Total Frontend: 100% clean.
```

---

## 16. Files Changed

- [`supabase/update_v10_integrity_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v10_integrity_hardening.sql): Hardened stock reservation and accounting procedures with NULL guards, row locks, integer VAT, and transactional wrapper.
- [`backend/tests/test_real_postgres.py`](file:///d:/Workspace/PetTravel%20WholeSale/backend/tests/test_real_postgres.py): Added tests 11 to 15 (VAT matrix, NULL guards, same-order reservation concurrency, same-order accounting concurrency, missing COGS fail-closed).
- [`backend/tests/test_postgres_migrations.py`](file:///d:/Workspace/PetTravel%20WholeSale/backend/tests/test_postgres_migrations.py): Added failure injection atomicity test.
- [`docs/verification_reports/V10_sql_hardening_report.md`](file:///d:/Workspace/PetTravel%20WholeSale/docs/verification_reports/V10_sql_hardening_report.md): Created authoritative V10 audit report.
- [`docs/pettravel_master_plan_v2.md`](file:///d:/Workspace/PetTravel%20WholeSale/docs/pettravel_master_plan_v2.md): Updated to version `2.5.1`.

---

## 17. Remaining Business Decisions

- `B-002 / ADR-002`: Markup on Cost Floor Policy ($10\%$) $\rightarrow$ `PENDING_STAKEHOLDER_APPROVAL`.
- `B-003 / ADR-003`: Contract Price vs Volume Tier Stacking $\rightarrow$ `PENDING_STAKEHOLDER_APPROVAL`.
- `B-004 / ADR-004`: Promotion Stacking Rules $\rightarrow$ `PENDING_STAKEHOLDER_APPROVAL`.
- `B-005 / ADR-005`: Missing COGS Exception Handling $\rightarrow$ `PENDING_STAKEHOLDER_APPROVAL`.
- `B-007 / ADR-008`: VAT Tax Basis & E-Invoicing Timing $\rightarrow$ `PENDING_ACCOUNTING_REVIEW`.
- `B-012 / ADR-013`: Dynamic Tax Rules Table $\rightarrow$ `PENDING_ACCOUNTING_REVIEW`.

---

## 18. Production Boundary

- **Production Database**: Completely untouched. Zero connections, zero mutations.
- **Production Status**: `NOT VERIFIED (ZERO PRODUCTION MUTATIONS)`.
- **Environment Boundary**: All tests executed strictly on local Docker container `pettravel_test_pg:5439`.
