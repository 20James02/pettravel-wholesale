# V13 Rollback & Recovery Strategy Runbook

## 1. Overview & Architectural Policy
- **Target Migration**: `supabase/update_v13_order_lifecycle_canonicalization.sql`
- **Migration Hash (SHA256)**: `03DAA2ECB14932C36E6B62E0CBFFA4669F911A0CE99B686FDAF4C252755CDCC0`
- **Policy**: In accordance with the Pet Travel Wholesale Security & Integrity Charter, integrity-preserving constraints (such as `pt_guard_accepted_quote_immutability`, `pt_guard_locked_order_item_immutability`, `uq_quote_versions_single_accepted`, and `uq_customer_orders_active_org`) must **never** be rolled back in a manner that reintroduces commercial ambiguity, stock overselling, or silent overwrite risks.

---

## 2. Reversible vs. Non-Reversible Components

### A. Non-Reversible Safety Guards (Roll-Forward Only)
1. **Accepted Quote Immutability Trigger (`trg_guard_accepted_quote_immutability`)**:
   - Rolling back this trigger would allow modifying commercial snapshots of accepted contracts, violating accounting auditability and legal integrity.
   - **Strategy**: Roll-forward repair if any schema column needs whitelisting.
2. **Locked Items Guard (`trg_guard_locked_order_item_immutability`)**:
   - Protects unit prices and SKUs from being silently altered during fulfillment.
   - **Strategy**: Roll-forward only.
3. **One Active Order Invariant (`uq_customer_orders_active_org`)**:
   - Enforces the business invariant of a single active workflow per organization.
   - **Strategy**: Data reconciliation via administrative scripts, not dropping the uniqueness index.

### B. Reversible Elements (Emergency Disablement)
If an emergency requires reverting specific non-critical columns or audit tables:
```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Disable audit revision trigger if required
DROP TRIGGER IF EXISTS trg_guard_accepted_quote_immutability ON public.quote_versions;
DROP TRIGGER IF EXISTS trg_guard_accepted_adjustment_immutability ON public.quote_adjustments;
DROP TRIGGER IF EXISTS trg_guard_locked_order_item_immutability ON public.order_items;

-- 2. Drop non-critical indexes if needed
DROP INDEX IF EXISTS public.uq_quote_versions_single_accepted;
DROP INDEX IF EXISTS public.uq_customer_orders_active_org;

COMMIT;
```

---

## 3. Roll-Forward Recovery Procedure
If schema mismatch occurs on production:
1. Isolate the offending transaction ID.
2. Formulate a V14 forward-correction script: `supabase/update_v14_forward_repair.sql`.
3. Test V14 on local PostgreSQL 18 with preflight dirty-data checks before executing on staging or production.
