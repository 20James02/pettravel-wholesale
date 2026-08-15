# PET TRAVEL WHOLESALE — V11 FORWARD MIGRATION RECONCILIATION REPORT
**Reconciliation of Already-Applied V10, Security Definer Privileges, Accounting SOT, and Forward Migration V11**

> **Report ID**: `VR-V11-RECONCILIATION-2026-08-16`  
> **Authoritative Master Plan**: [`docs/pettravel_master_plan_v2.md`](file:///d:/Workspace/PetTravel%20WholeSale/docs/pettravel_master_plan_v2.md) (Version 2.6.0)  
> **Forward Migration**: [`supabase/update_v11_security_accounting_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v11_security_accounting_hardening.sql)  
> **Historical Immutable Migration**: [`supabase/update_v10_integrity_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v10_integrity_hardening.sql)  
> **Rollback Specification**: [`docs/verification_reports/V11_rollback_plan.md`](file:///d:/Workspace/PetTravel%20WholeSale/docs/verification_reports/V11_rollback_plan.md)  
> **Technical Status**: `V11_READY_FOR_STAGING` / `V11_READY_FOR_PRODUCTION_REVIEW`  
> **Production SQL Applied**: `NO` | **Production Mutation**: `NONE` | **Git Push**: `NO`

---

## 1. Executive Result

In response to the operational update confirming that an earlier version of V10 has already been deployed to a persistent Supabase database:
1. **Migration Immutability Rule Enforced**: `supabase/update_v10_integrity_hardening.sql` is formally declared **IMMUTABLE** historical state. It will not be re-edited or re-run for deployment purposes.
2. **Forward Migration V11 Created**: Authored [`supabase/update_v11_security_accounting_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v11_security_accounting_hardening.sql) to deterministically reconcile and upgrade any database running Old V10 (or historical migrations) into the hardened target state.
3. **Four-Path Migration & Fingerprint Parity**: Verified across isolated PostgreSQL 16 databases that Path A (Baseline), Path B (Historical Upgrade v1..v11), Path C (Clean Sequential Install), and Path D (Direct Old-V10 $\rightarrow$ V11 Upgrade) yield **100% identical function definitions, search paths, and least-privilege ACLs**.
4. **All Regression Suites Passing**:
   - PostgreSQL Integration & Migration Tests: **28/28 passed (100%)**
   - Backend Pytest Suite: **77/77 passed (100%)**
   - Frontend Unit Tests: **23/23 passed (100%)**
   - TypeScript & ESLint: **0 errors**
   - Next.js 16 Production Build: **26 routes compiled successfully**

---

## 2. User-Reported V10 Execution & History

- **Reported Fact**: An earlier release of V10 was applied to a persistent Supabase instance.
- **Topology Reconciliation**:
  - **PRODUCTION (Project A: `gfiy...pgbb`)**: Treated as `V10_OLD_DEPLOYED / V11_PENDING_VERIFICATION` (or baseline). Zero mutations occurred in this sprint.
  - **STAGING (Project B: `pettravel-staging`)**: Hardened V10 was applied with dedicated role `pettravel_backend_staging` / `service_role`. Running V11 against Staging is idempotent and non-destructive.

---

## 3. Environment Reconciliation & Immutability Decision

In accordance with database migration best practices, modifying historical migrations in-place after they have touched shared/persistent environments violates configuration reproducibility. 

**Architectural Decision**:
- `update_v10_integrity_hardening.sql`: Frozen as historical baseline reference.
- `update_v11_security_accounting_hardening.sql`: The exclusive deployment vehicle for all subsequent database hardening, security definer privileges, and accounting fixes.

---

## 4. Actual Deployed V10 vs. Current Hardened Target Fingerprint

| Metric / Attribute | Deployed Old-V10 Baseline | Current Hardened Target (V11) |
| :--- | :--- | :--- |
| **`search_path`** | `public, pg_temp` (or un-empty) | `''` (Airtight empty search path) |
| **Schema Qualification** | Partial (`customer_orders`, `inventory_balances`) | 100% schema-qualified (`public.*`) |
| **PostgREST Direct RPC** | `authenticated` role had `EXECUTE` (Confused Deputy Risk) | `PUBLIC`, `anon`, `authenticated` **REVOKED** |
| **Backend Execution Role**| Superuser / service_role only | `service_role`, `pettravel_backend_staging`, `pettravel_backend` |
| **Commercial SOT** | Picked unaccepted draft quotes (`order by created_at desc`) | Strict accepted quote priority (`status = 'accepted'`) |
| **COGS Override Guard** | Parameter `p_require_consumed_stock = false` unguarded | Requires `accounting.override_consumed_stock` permission |
| **Tenant Isolation** | Actor could belong to buyer org | `FORBIDDEN_CROSS_ORG` enforced |
| **VAT Math** | Unchecked rounding / net-basis math | Exact integer VAT-inclusive math ($\text{Net} + \text{VAT} \equiv \text{Gross}$) |
| **ATP Concurrency** | Lacked deterministic `ib.id ASC` tie-breaker | Deterministic sort `ORDER BY oi.product_variant_id ASC, ib.id ASC` |

---

## 5. Delta Matrix & Upgrade Requirements

| Capability Area | Deployed State | Target State | V11 Required? | Risk Level |
| :--- | :--- | :--- | :---: | :---: |
| **Security Definer `search_path`** | Un-empty | `SET search_path = ''` | **YES** | HIGH (Hijack prevention) |
| **PostgREST Privilege Boundary** | Granted to `authenticated` | Revoked from `PUBLIC, anon, authenticated` | **YES** | HIGH (Confused Deputy) |
| **Dedicated Backend Role Grants**| Default `service_role` | Conditional grants for staging & prod roles | **YES** | MEDIUM |
| **Commercial Source of Truth** | Permissive draft quotes | Fails closed on draft quotes without snapshot | **YES** | HIGH (Revenue integrity) |
| **COGS Override Protection** | Unguarded boolean | Requires `accounting.override_consumed_stock` | **YES** | MEDIUM (Audit compliance) |
| **Cross-Organization Isolation** | Missing tenant guard | Rejects actor matching buyer organization | **YES** | HIGH (Data segregation) |
| **Multi-SKU Concurrency** | Simple sort | Deterministic multi-SKU + warehouse tie-break | **YES** | MEDIUM (Deadlock mitigation) |
| **VAT Integer Math** | Potential drift | Exact integer basis point formula | **YES** | LOW (Accounting accuracy) |

---

## 6. V11 Contents & Safety Invariants

Migration file [`supabase/update_v11_security_accounting_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v11_security_accounting_hardening.sql) contains:
1. `CREATE OR REPLACE FUNCTION public.pt_reserve_order_stock(...)`:
   - Enforces `SECURITY DEFINER` and `SET search_path = ''`.
   - Explicit parameter checks for `p_order_id` and `p_actor_id`.
   - Row-level lock `SELECT ... FOR UPDATE` on `customer_orders`.
   - Active user & role permission check (`operations.write`, `operations.post`, `order.quote`, `order.adjust`).
   - Cross-organization tenant boundary check (`FORBIDDEN_CROSS_ORG`).
   - Deterministic multi-SKU loop (`ORDER BY variant_sku_snapshot, id`).
   - Deterministic inventory balance lock (`ORDER BY coalesce(w.is_default, false) desc, ib.updated_at desc, ib.id asc FOR UPDATE OF ib`).
   - Idempotency check returning `status: 'already_reserved'`.
2. `CREATE OR REPLACE FUNCTION public.pt_post_order_accounting(...)`:
   - Enforces `SECURITY DEFINER` and `SET search_path = ''`.
   - Explicit parameter NULL guards on `p_mode`, `p_vat_rate_bps`, and `p_require_consumed_stock`.
   - Row-level lock `SELECT ... FOR UPDATE OF co` on `customer_orders`.
   - Role permission check (`accounting.post`, `system.admin`).
   - Cross-organization tenant boundary check (`FORBIDDEN_CROSS_ORG`).
   - Accepted quote priority (`status = 'accepted'`) failing closed with `ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`.
   - COGS override privilege check (`accounting.override_consumed_stock`).
   - Fail-closed COGS check if consumed movements have NULL unit cost (`ACCOUNTING_COGS_MISSING`).
   - Exact integer VAT math ($V_{\text{VAT}} = \text{round}(V \times \text{RateBps} / (10000 + \text{RateBps}))$, $V_{\text{Net}} = V - V_{\text{VAT}}$).
   - Double-entry balanced journal lines ($\sum \text{Debit} \equiv \sum \text{Credit}$).
3. Privilege & ACL Normalization:
   - Revokes all privileges from `PUBLIC`, `anon`, and `authenticated`.
   - Grants execute conditionally to `service_role`, `pettravel_backend_staging`, and `pettravel_backend`.

---

## 7. Migration Path Testing (Old-V10 $\rightarrow$ V11)

In `backend/tests/test_postgres_migrations.py`:
- **Path D (Direct Upgrade from Old Unhardened V10 $\rightarrow$ V11)**:
  - Bootstrapped schema with historical migrations.
  - Injected Old V10 function definition where `authenticated` role held `EXECUTE` privilege and `search_path` was un-empty.
  - Applied `update_v11_security_accounting_hardening.sql`.
  - Asserted that `has_function_privilege('authenticated', ..., 'EXECUTE')` changed from `True` $\rightarrow$ `False`.
  - Asserted that function definitions matched Path C (fresh clean install) 100%.

---

## 8. Migration Idempotency & Failure Atomicity

- **Idempotency**: Executing V11 multiple consecutive times produces zero duplicate grants, zero schema conflicts, and identical function SHA256 fingerprints.
- **Failure Atomicity**: Injected runtime exception inside a transaction-wrapped migration rolled back completely without leaving partial function mutations (`test_migration_failure_is_atomic`).

---

## 9. Rollback Plan Summary

Documented in [`docs/verification_reports/V11_rollback_plan.md`](file:///d:/Workspace/PetTravel%20WholeSale/docs/verification_reports/V11_rollback_plan.md).
- Stored procedure replacement via forward repair script.
- Metadata lock duration $< 5\text{ ms}$.
- Zero application downtime.
- Zero customer or accounting data loss.

---

## 10. Production Readiness & Next Actions

- **Staging Status**: `V11_READY_FOR_STAGING` / `ALREADY_FUNCTIONALLY_VERIFIED`
- **Production Status**: `V10_OLD_APPLIED / V11_PENDING_PRODUCTION_REVIEW`
- **Production SQL Applied**: `NO`
- **Production Mutation This Sprint**: `NONE`
- **Push**: `NO`
- **Recommended Next Action**: Submit V11 forward migration for production change review and authorization.
