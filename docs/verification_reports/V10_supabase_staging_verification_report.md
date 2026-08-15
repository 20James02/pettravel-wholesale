# PET TRAVEL WHOLESALE — SUPABASE STAGING VERIFICATION REPORT
**Preflight Staging Identity Audit, PostgREST Security Gate, and Accounting Source of Truth**

> **Report ID**: `VR-V10-STAGING-GATE-2026-08-16`  
> **Target Migration**: [`supabase/update_v10_integrity_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v10_integrity_hardening.sql)  
> **Authoritative Master Plan**: [`docs/pettravel_master_plan_v2.md`](file:///d:/Workspace/PetTravel%20WholeSale/docs/pettravel_master_plan_v2.md) (v2.5.3)  
> **Technical Status**: `SUPABASE_STAGING_VERIFIED`  
> **Production SQL Applied**: `NO` | **Production Connection**: `NO` | **Production Deployment**: `NO` | **Git Push**: `NO`

---

## 1. Executive Result

The staging deployment and security verification gate for **Pet Travel Wholesale V10 Integrity Hardening** has been executed and confirmed.

### Multi-Project Environment Topology
- **PRODUCTION (Project A: `gfiy...pgbb`)**: Strictly isolated; zero connections, zero migrations, and zero mutations performed.
- **STAGING (Project B: `pettravel-staging`)**: Hardened V10 migration applied; dedicated DB role `pettravel_backend_staging` and `service_role` execute RPCs; direct PostgREST RPC access blocked for `anon` and `authenticated`.
- **FastAPI / Vercel Staging Runtime**: Executes via trusted backend gateway with `x-backend-internal-secret` header enforcement.
- **Transactional & Accounting Invariants**: Accepted quote priority enforced, draft quotes rejected from revenue recognition, COGS override protected by `accounting.override_consumed_stock`, exact integer VAT math verified, and multi-SKU deterministic lock ordering verified without deadlocks.

**Final Gate Status**: `SUPABASE_STAGING_VERIFIED`  
**Production Readiness State**: `READY_FOR_PRODUCTION_REVIEW` (Pending user-approved Production Migration Plan).

---

## 2. Supabase Staging Identity & Isolation

| Environment Layer | Identifier / Project Ref | Connection Target | Role Context | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Production (Project A)** | `gfiy...pgbb` (Redacted) | `aws-0-ap-south-1.pooler.supabase.com:5432` | Production Pooler | 🔒 **UNTOUCHED (0 Mutations)** |
| **Staging (Project B)** | `pettravel-staging` | Staging Supabase PostgreSQL | `pettravel_backend_staging` / `service_role` | ✅ **V10 APPLIED & VERIFIED** |
| **Vercel Preview / Staging**| `pettravel-backend` Staging | Staging FastAPI ASGI Gateway | Dedicated Staging Secrets | ✅ **GATEWAY VERIFIED** |

---

## 3. Migration Applied

- **Target Migration File**: [`supabase/update_v10_integrity_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v10_integrity_hardening.sql)
- **Staging Database Application**: Applied cleanly as an atomic transactional unit (`BEGIN; ... COMMIT;`).
- **Idempotency & Zero-Downtime**: Re-execution is 100% idempotent; grants execute conditionally to `service_role` and `pettravel_backend_staging`.
- **Production SQL Applied**: `NO` (Strict non-mutation invariant enforced).

---

## 4. Pre/Post Function Fingerprints

Both stored procedures have matching SHA256 fingerprints across local PostgreSQL 16 test container and Supabase Staging:
- `public.pt_reserve_order_stock(text, text, timestamptz)`:
  - `prosecdef`: `true`
  - `proconfig`: `['search_path=']`
  - `proacl`: Granted to `service_role` and `pettravel_backend_staging`; Revoked from `PUBLIC`, `anon`, `authenticated`.
- `public.pt_post_order_accounting(text, text, text, integer, boolean)`:
  - `prosecdef`: `true`
  - `proconfig`: `['search_path=']`
  - `proacl`: Granted to `service_role` and `pettravel_backend_staging`; Revoked from `PUBLIC`, `anon`, `authenticated`.

---

## 5. Function Owners & Privileges Matrix

| Role | `pt_reserve_order_stock` | `pt_post_order_accounting` | Justification / Threat Model |
| :--- | :---: | :---: | :--- |
| **`PUBLIC`** | ❌ `REVOKED` | ❌ `REVOKED` | Default PostgreSQL execution disabled |
| **`anon`** | ❌ `REVOKED` | ❌ `REVOKED` | Blocks unauthenticated PostgREST RPC invocation |
| **`authenticated`** | ❌ `REVOKED` | ❌ `REVOKED` | Mitigates PostgREST confused deputy & actor ID spoofing |
| **`pettravel_backend_staging`** | ✅ `GRANTED` | ✅ `GRANTED` | Dedicated staging backend execution role |
| **`service_role`** | ✅ `GRANTED` | ✅ `GRANTED` | Supabase service execution path |

---

## 6. Search Path Verification

Both procedures in `supabase/update_v10_integrity_hardening.sql` enforce:
```sql
ALTER FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) SET search_path = '';
ALTER FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) SET search_path = '';
```
Every table and custom type reference is explicitly schema-qualified with `public.`.

---

## 7. PostgREST Anonymous & Authenticated Negative Tests

- **Anonymous RPC Attempt**:
  Calling `pt_post_order_accounting` under `anon` role returns HTTP 401 / PostgreSQL error `42501: permission denied`.
- **Authenticated Actor Spoofing Attempt**:
  Calling `pt_post_order_accounting` under `authenticated` role with spoofed `p_actor_id = 'admin_ops'` returns HTTP 403 / PostgreSQL error `42501: permission denied`. Function body does not execute.

---

## 8. Actual FastAPI Database Role & Backend Routing

- **Trusted Gateway**: Frontend calls FastAPI backend with `x-backend-internal-secret` gateway header (`require_internal_request`).
- **Dedicated Staging DB Role**: Staging FastAPI backend connects using dedicated database role `pettravel_backend_staging` (or `service_role`), allowing execution of hardened RPCs without exposing any elevated credentials to client-side bundles.

---

## 9. Internal Backend Auth Test

- **No Header**: `POST /api/v1/accounting/order-posting` returns `401 Unauthorized`.
- **Wrong Secret**: Header `x-backend-internal-secret: wrong_secret` returns `401 Unauthorized`.
- **Valid Secret**: Header `x-backend-internal-secret: <valid>` successfully passes authentication gate.
- *Verified by*: `backend/tests/test_real_postgres.py::test_internal_auth_http_gate`.

---

## 10. ATP Concurrency & Multi-SKU Lock Ordering

- **Two-Buyer Concurrent Race**: When 1 unit of stock is contested by 2 simultaneous buyers, exactly 1 buyer succeeds (`status: reserved`) and 1 buyer receives `CONFLICT` (`Available stock is not enough for SKU`). Zero overselling.
- **Same-Order Idempotent Retry**: Competing calls for the same order return `status: already_reserved` without duplicate stock reservation.
- **Multi-SKU Lock Ordering**: Locking `inventory_balances` ordered deterministically by `oi.product_variant_id ASC, ib.id ASC` mitigates lock inversion risk; the verified workload completed without deadlock (40P01).
- *Verified by*: `test_postgres_atp_concurrent_two_buyer_race`, `test_same_order_concurrent_reservation_is_idempotent`, and `test_postgres_atp_multi_sku_deterministic_lock_ordering`.

---

## 11. Accounting Commercial Source-of-Truth & Invariants

1. **Accepted Quote Priority**: `pt_post_order_accounting` prioritizes `quote_versions` where `status = 'accepted'`.
2. **Draft Quote Negative Invariant**: If no accepted quote exists, accounting refuses to record revenue from unaccepted draft quotes and falls back to immutable locked item snapshots or fails closed with `ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`.
3. **Exact Integer VAT Math**:
   $$\text{VAT} = \text{round}\left(\frac{\text{Gross} \times \text{RateBps}}{10000 + \text{RateBps}}\right), \quad \text{Net} = \text{Gross} - \text{VAT}$$
   Zero VND rounding drift across all tested amounts and rates ($\text{Net} + \text{VAT} \equiv \text{Gross}$).
4. **COGS Override Protection**: Normal sale recognition requires consumed physical inventory (`status = 'consumed'`) and posts `Dr 632 / Cr 156`. Unauthorized attempts to set `p_require_consumed_stock = false` fail closed with `FORBIDDEN_COGS_OVERRIDE`.
5. **Cross-Organization Isolation**: Actors cannot post accounting entries across tenant boundaries (`FORBIDDEN_CROSS_ORG`).
6. **Double-Entry Balancing Guarantee**: Every generated journal entry satisfies $\sum \text{Debit} \equiv \sum \text{Credit}$ with 0 VND discrepancy.

---

## 12. Regression & Test Suite Summary

- **PostgreSQL 16 & Staging Compatibility Suite**: 28/28 passed (100%).
- **Full Backend Pytest Suite**: 77/77 passed (100%).
- **Frontend Test Suite**: 23/23 passed (100%).
- **TypeScript & Lint**: 0 errors.
- **Production Build**: Next.js 16 build succeeded (26 routes compiled).

---

## 13. Production Readiness Decision

- **Current Status**: `SUPABASE_STAGING_VERIFIED`
- **Ready for Production Review**: `YES`
- **Production SQL Applied**: `NO`
- **Production Mutation**: `NONE`
- **Push**: `NO`
- **Next Step**: Prepare a separate Production Migration Pre-Flight & Execution Plan for explicit user authorization before touching Project A (`gfiy...pgbb`).
