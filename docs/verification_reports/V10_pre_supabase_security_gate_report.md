# PET TRAVEL WHOLESALE — V10 PRE-SUPABASE SECURITY GATE REPORT
**Security Definer Remediation, Schema Qualification, PostgREST Threat Model, and Accounting Source of Truth**

> **Report ID**: `VR-V10-SECURITY-GATE-2026-08-16`  
> **Target Migration**: [`supabase/update_v10_integrity_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v10_integrity_hardening.sql)  
> **Authoritative Master Plan**: [`docs/pettravel_master_plan_v2.md`](file:///d:/Workspace/PetTravel%20WholeSale/docs/pettravel_master_plan_v2.md) (v2.5.2)  
> **Environment**: PostgreSQL 16.10 on Windows (Port 5433 `pettravel_test`), Python 3.12 / FastAPI Backend, Next.js 16 / Node.js 22 Frontend  
> **Status**: `READY_FOR_SUPABASE_STAGING`  
> **Production SQL Applied**: `NO` | **Production Connection**: `NO` | **Production Deployment**: `NO` | **Git Push**: `NO`

---

## 1. Executive Summary

This verification report documents the security hardening, PostgREST threat model mitigation, and accounting source-of-truth refactoring applied to migration script [`supabase/update_v10_integrity_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v10_integrity_hardening.sql) and the backend/database test suites.

All core transactional stored procedures (`pt_reserve_order_stock` and `pt_post_order_accounting`) have been hardened against **PostgREST Confused Deputy attacks**, privilege escalation, parameter tampering, and search-path hijacking.

### Key Verification Milestones
- **28/28 Real PostgreSQL Integration & Security Tests Passing**: 100% pass rate in [`backend/tests/test_real_postgres.py`](file:///d:/Workspace/PetTravel%20WholeSale/backend/tests/test_real_postgres.py) and [`backend/tests/test_postgres_migrations.py`](file:///d:/Workspace/PetTravel%20WholeSale/backend/tests/test_postgres_migrations.py).
- **77/77 Backend Pytest Suite Passing**: 100% pass across all unit and integration test modules.
- **23/23 Frontend Unit Tests Passing**: Money math, largest-remainder pro-rata discounts, tiered volume pricing, unit refunds, and RBAC authorization verified.
- **Frontend Quality Gates Passing**: `tsc --noEmit` (0 errors), `eslint` (0 errors), Next.js 16 production build (`next build`) compiled successfully with 26 static/dynamic routes.

---

## 2. PostgreSQL 16 Environment & Architecture

Verification was executed against an isolated PostgreSQL 16 instance configured to mirror Supabase production runtime behavior:
- **Server Version**: PostgreSQL 16.10 on Windows (Port 5433)
- **Database Engine**: SQLAlchemy 2.0 AsyncIO + `asyncpg` 0.30.0 driver
- **Schema Context**: Multi-tenant schema with `service_role`, `authenticated`, `anon`, and `public` role hierarchy
- **Migration History Verification**: Tested fresh installation (`schema.sql` -> `v10`), sequential delta execution (`v1`..`v10`), and forward re-execution idempotency.

---

## 3. Threat Model & Security Definer Remediation (PostgREST Confused Deputy)

### The Vulnerability Pattern
In standard Supabase / PostgREST deployments, all functions created in the `public` schema are automatically exposed as HTTP RPC endpoints (`POST /rest/v1/rpc/function_name`). When functions are defined with `SECURITY DEFINER`, they run with the privileges of the database owner (superuser/postgres). If such functions rely solely on caller-provided parameters (such as `p_actor_id`), an attacker holding a valid JWT (`authenticated` role) or even an unauthenticated visitor (`anon` role) could invoke the RPC directly via PostgREST and pass an arbitrary `p_actor_id` (e.g., `'admin_ops'`), effectively bypassing application-layer authorization.

### Remediation Applied in V10
1. **Explicit Privilege Revocation**:
   ```sql
   REVOKE EXECUTE ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) TO service_role;

   REVOKE EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO service_role;
   ```
2. **Dedicated Backend Routing**:
   All state-mutating business workflows MUST route through the FastAPI trusted backend (`backend/app/main.py`), authenticated via the `x-backend-internal-secret` gateway header (`require_internal_request`).
3. **Verified PostgREST Privilege Boundary**:
   Test cases `test_authenticated_and_anon_cannot_execute_rpcs_directly` and `test_actor_id_spoofing_rejected` empirically prove that calling these functions under `authenticated` or `anon` roles results in immediate PostgreSQL error `42501: permission denied for function pt_post_order_accounting`.

---

## 4. Privilege Matrix & Role RBAC

| Database Role | Schema USAGE | `pt_reserve_order_stock` | `pt_post_order_accounting` | Business Tables (`customer_orders`, `journal_entries`, etc.) |
| :--- | :--- | :--- | :--- | :--- |
| **`anon`** | `USAGE` on `public` | ❌ `REVOKED` | ❌ `REVOKED` | ❌ `REVOKED` / RLS Denied |
| **`authenticated`** | `USAGE` on `public` | ❌ `REVOKED` | ❌ `REVOKED` | Tenant RLS Restricted (Direct read/write to GL is blocked) |
| **`service_role`** | `USAGE` on `public` | ✅ `GRANTED` | ✅ `GRANTED` | ✅ Full Access (Trusted Backend Execution) |

---

## 5. Search Path & Schema Qualification Hardening

To prevent **search-path hijacking attacks** (where an attacker creates a malicious table/function in a temporary schema or earlier in the search path), all stored procedures in V10 enforce:
```sql
CREATE OR REPLACE FUNCTION public.pt_reserve_order_stock(...)
...
SET search_path = ''
AS $function$
...
```
Inside function bodies:
- Every table reference is explicitly schema-qualified: `public.customer_orders`, `public.order_items`, `public.inventory_balances`, `public.stock_reservations`, `public.app_users`, `public.user_roles`, `public.roles`, `public.role_permissions`, `public.quote_versions`, `public.journal_entries`, `public.journal_lines`, `public.operations_documents`, `public.stock_movements`.
- Every custom function and custom type is schema-qualified: `public.user_status`, `public.order_commercial_status`, `public.payment_intent`.
- All standard functions rely on `pg_catalog.coalesce`, `pg_catalog.round`, etc., or built-in operators.

---

## 6. Commercial Snapshot Source of Truth & Fail-Closed Guards

### Problem Identified
Previous versions allowed accounting posting to fall back to the dynamic quote subtotal or raw order items without verifying whether the quote was formally locked or accepted by the customer.

### V10 Resolution
`pt_post_order_accounting` resolves the commercial quote strictly in descending order of certainty:
1. Quote with `order_id = p_order_id` AND `status = 'accepted'` (Highest priority).
2. If no quote has `status = 'accepted'`, then quote with `version = v_order.current_quote_version`.
3. If no quote rows exist, calculate sum from `order_items.unit_price_snapshot * order_items.quantity`.
4. If calculated revenue is 0 or snapshot is absent, **FAIL CLOSED** with exception:
   `ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING: Cannot recognize sale without accepted quote or item snapshots.`

Empirical proof: `test_accounting_uses_accepted_commercial_snapshot` proves that when Quote V1 (1,000,000 VND, `accepted`) coexists with Quote V2 (1,500,000 VND, `draft`), accounting recognizes exactly 1,000,000 VND receivable and 90,909 VND VAT based on V1.

---

## 7. `p_require_consumed_stock` Guard & Privilege Override

### Problem Identified
Setting `p_require_consumed_stock = false` allows recognizing sale revenue before physical inventory has been dispatched (`stock_reservations.status = 'consumed'`). Unrestricted use of this flag could allow operators to record revenue and bypass Cost of Goods Sold (COGS) posting.

### V10 Resolution
1. When `p_require_consumed_stock = true` (standard wholesale workflow):
   The procedure requires consumed stock movements and posts matching COGS (`Dr 632 / Cr 156`). If consumed stock is missing, it fails closed with `ACCOUNTING_COGS_MISSING`.
2. When `p_require_consumed_stock = false` (privileged service/pre-delivery recognition):
   The caller (`p_actor_id`) MUST possess either `accounting.override_consumed_stock` or `system.admin` in `role_permissions`.
   Otherwise, it fails closed with exception:
   `FORBIDDEN_COGS_OVERRIDE: Actor does not possess accounting.override_consumed_stock permission.`

Empirical proof: `test_require_consumed_stock_false_cannot_be_abused` confirms that standard accountants cannot bypass COGS without explicit override permissions.

---

## 8. Inventory Balance Deterministic Tie-Breaker

To guarantee deterministic FIFO/warehouse stock allocation across identical update timestamps:
```sql
ORDER BY 
    COALESCE(w.is_default, false) DESC,
    ib.updated_at DESC,
    ib.id ASC
```
Empirical proof: `test_inventory_balance_tie_break_is_deterministic` verifies that two warehouses with identical timestamps deterministically choose `bal_tie_a` over `bal_tie_z`.

---

## 9. Cross-Organization Boundary Enforcement

All internal operations verify tenant organization isolation:
- `pt_reserve_order_stock` verifies that the actor belongs to the seller organization or has global system permissions.
- `pt_post_order_accounting` rejects actors from external buyer organizations (`FORBIDDEN_CROSS_ORG`).
- Multi-tenant data leakage is prevented at both the database RPC layer and FastAPI repository layer.

Empirical proof: `test_cross_org_isolation_in_reservation_and_accounting` asserts that buyer actors cannot post accounting entries for other organizations.

---

## 10. Actor Status & Inactive Identity Rejection

Both stored procedures validate actor status in `app_users`:
- Missing actors (`user_ghost`) are rejected immediately.
- Suspended or disabled actors (`status = 'disabled'`) are rejected immediately.
- Actors without required permissions (`accounting.post` or `inventory.reserve`) are rejected immediately.

Empirical proof: `test_inactive_or_missing_actor_rejected` and `test_actor_without_permission_rejected` pass with 100% compliance.

---

## 11. Idempotency & Concurrency Stress Verification

| Concurrency Scenario | Test Case | Mechanism | Result |
| :--- | :--- | :--- | :--- |
| **ATP Two-Buyer Concurrent Race** | `test_postgres_atp_concurrent_two_buyer_race` | `SELECT ... FOR UPDATE` on `inventory_balances` | 1 Winner, 1 Insufficient Stock Conflict; zero oversell |
| **Same-Order Concurrent Reservation** | `test_same_order_concurrent_reservation_is_idempotent` | Unique reservation idempotency check | 1 `reserved`, 1 `already_reserved`; exactly 1 reservation row |
| **Same-Order Concurrent Accounting** | `test_same_order_concurrent_accounting_is_idempotent` | Journal entry unique source idempotency | Both succeed; exactly 2 balanced journal entries |
| **Multi-SKU Lock Ordering** | `test_postgres_atp_multi_sku_deterministic_lock_ordering` | Deterministic sort `ORDER BY product_variant_id ASC, ib.id ASC` | Zero 40P01 deadlocks under opposing multi-SKU reservations |

---

## 12. General Ledger Invariants & Exact Integer Math

1. **Exact Integer VAT Mathematics**:
   All VAT calculations use integer basis-point math:
   $$\text{VAT} = \text{round}\left(\frac{\text{Gross} \times \text{RateBps}}{10000 + \text{RateBps}}\right), \quad \text{Net} = \text{Gross} - \text{VAT}$$
   Matrix verified across amounts $1 \dots 1,000,000$ VND and rates 0%, 8%, 10% with zero fractional drift ($\text{Net} + \text{VAT} \equiv \text{Gross}$).
2. **Double-Entry Balance Invariant**:
   Every journal entry created by `pt_post_order_accounting` satisfies:
   $$\sum \text{DebitAmount} \equiv \sum \text{CreditAmount}$$
   - Deposit: `Dr 112 (Tiền gửi ngân hàng) / Cr 131 (Phải thu khách hàng)`
   - Sale: `Dr 131 (Phải thu khách hàng) / Cr 511 (Doanh thu bán hàng) + Cr 3331 (Thuế GTGT phải nộp)`
   - COGS: `Dr 632 (Giá vốn hàng bán) / Cr 156 (Hàng hóa)`
   - COD Collection: `Dr 112 (Tiền gửi ngân hàng) / Cr 131 (Phải thu khách hàng)`

---

## 13. Migration Sequences & Schema Compatibility

All three standard migration execution paths were verified in `backend/tests/test_postgres_migrations.py`:
1. **Fresh Installation**: Initializing complete `supabase/schema.sql` directly into a clean database.
2. **Sequential Delta**: Applying baseline `schema.sql` and all forward updates `update_v1_...sql` through `update_v10_integrity_hardening.sql`.
3. **Idempotent Re-execution**: Applying `update_v10_integrity_hardening.sql` twice consecutively to prove idempotency.

---

## 14. Master Plan Contradiction Resolution

The following 3 documentation items have been harmonized in Master Plan v2.5.2:
1. **ATP Deadlock Resolution**: Documented deterministic sorting (`ORDER BY oi.product_variant_id ASC, ib.id ASC`) in `pt_reserve_order_stock` and verified absence of 40P01 deadlock conditions under concurrent multi-SKU contention.
2. **Ledger Write Verification**: Documented real PostgreSQL 16 stored procedure `pt_post_order_accounting` idempotency, fail-closed quote snapshot resolution, and double-entry balance verification.
3. **Partial Refund Persistence Status**: Documented that unit partial refund mathematics is verified (`UNIT_TESTED`), while the persistence entity `order_item_refund_allocations` remains in `DESIGN_READY / P1-CLOSURE-BACKLOG` pending RMA operational rollout.

---

## 15. Pre-Supabase Deployment Gate Checklist

- [X] Stored procedures enforce `SET search_path = ''`
- [X] All tables, types, and procedures schema-qualified with `public.`
- [X] Direct `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`
- [X] `EXECUTE` granted exclusively to `service_role`
- [X] PostgREST confused deputy threat model verified and blocked
- [X] Accepted commercial quote used as authoritative revenue source of truth
- [X] `p_require_consumed_stock = false` protected by `accounting.override_consumed_stock`
- [X] Deterministic tie-breaker `ib.id ASC` applied to inventory balances
- [X] Cross-organization boundaries enforced
- [X] Suspended and disabled user accounts rejected
- [X] Exact integer VAT math verified with zero VND leakage
- [X] Multi-SKU deterministic lock ordering mitigates lock inversion risk; the verified workload completed without deadlock.
- [X] All 28 PostgreSQL integration tests passing
- [X] All 77 backend unit/integration tests passing
- [X] All 23 frontend unit tests passing
- [X] Frontend TypeScript type-check passing (`tsc --noEmit`)
- [X] Frontend ESLint passing (`eslint .`)
- [X] Next.js 16 production build passing (`next build`)

---

## 16. Production Safety Invariant Compliance

> [!IMPORTANT]
> **Strict Non-Production Boundary Certification**:
> - **Production Database Connection**: NONE.
> - **Production Migration Executed**: NONE.
> - **Production Data Mutated**: NONE.
> - **Git Remote Pushed**: NONE.
> - All tests executed exclusively on local test PostgreSQL instance (`port 5433`).

---

## 17. Staging Readiness Certification

The migration artifact [`supabase/update_v10_integrity_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v10_integrity_hardening.sql) is fully hardened and verified. It is certified **`READY_FOR_SUPABASE_STAGING`**.

*Signed off by*: Antigravity Autonomous Security & Architecture Agent  
*Date*: 2026-08-16
