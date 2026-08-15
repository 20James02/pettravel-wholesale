# PET TRAVEL WHOLESALE — V11 FORWARD MIGRATION ROLLBACK PLAN
**Deterministic Rollback & Forward Repair Strategy for Stored Procedures**

> **Document Status**: `AUTHORITATIVE ROLLBACK SPECIFICATION`  
> **Target Migration**: [`supabase/update_v11_security_accounting_hardening.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/update_v11_security_accounting_hardening.sql)  
> **Rollback SQL Artifact**: [`supabase/rollback_v11_forward_repair.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/rollback_v11_forward_repair.sql) / [`supabase/emergency/v11_forward_repair.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/emergency/v11_forward_repair.sql)  
> **Master Plan Version**: `2.6.0 (V11 Forward Security Reconciliation Baseline)`  
> **Author**: `Antigravity Coding Assistant`  
> **Date**: `2026-08-16`

---

## 1. Overview & Strategy

The V11 migration modifies only **stored procedure implementations** and **ACL grants** (`CREATE OR REPLACE FUNCTION` and `REVOKE / GRANT`). It does not modify table schemas, alter column types, or drop data.

### Rollback Philosophy & Security Invariant
A production rollback must distinguish a **FUNCTIONAL ROLLBACK** from a **SECURITY REGRESSION**:
- **Never Restore Known Security Vulnerabilities**: Under NO circumstances will rollback restore `EXECUTE` privileges to `PUBLIC`, `anon`, or `authenticated` (which would reintroduce the PostgREST Confused Deputy vulnerability), nor will it revert to an un-empty `search_path`.
- **Target Rollback State**: Restore the last known functionally compatible procedure behavior while **retaining**:
  - `SECURITY DEFINER`
  - `SET search_path = ''` (empty search path prevents object hijacking)
  - 100% schema qualification (`public.*`)
  - Explicit revocation from `PUBLIC`, `anon`, `authenticated`
  - Conditional grants to `service_role`, `pettravel_backend_staging`, `pettravel_backend`
  - Balanced General Ledger entries ($\sum \text{Debit} \equiv \sum \text{Credit}$)
  - Commercial snapshot priority and COGS override guards

---

## 2. Function Scope & Pre/Post Fingerprints

Both core stored procedures are explicitly covered by the rollback strategy:

### A. `public.pt_reserve_order_stock(text, text, timestamptz)`
- **Pre-V11 Deployed Fingerprint**:
  - `prosecdef`: `true`
  - `proconfig`: `['search_path=""']`
  - `proacl`: `{postgres=X/postgres,service_role=X/postgres}`
  - Item lock ordering: `ORDER BY variant_sku_snapshot, id`
  - Balance lock ordering: `ORDER BY coalesce(w.is_default, false) desc, ib.updated_at desc, ib.id asc`
- **Rollback Target**: Restores known-good stock reservation with row-level locks on `customer_orders`, deterministic SKU ordering, tenant boundary check, and active user validation.

### B. `public.pt_post_order_accounting(text, text, text, integer, boolean)`
- **Pre-V11 Deployed Fingerprint**:
  - `prosecdef`: `true`
  - `proconfig`: `['search_path=""']`
  - `proacl`: `{postgres=X/postgres,service_role=X/postgres}`
  - Commercial quote resolution: Prioritizes `quote_versions.status = 'accepted'`
- **Rollback Target**: Restores known-good double-entry journal generation, payment allocation reconciliation, exact integer VAT math, and COGS validation.

---

## 3. ACL Comparison Matrix

| Role | Pre-V11 Privilege | Target V11 Privilege | Rollback Target Privilege |
| :--- | :---: | :---: | :---: |
| **`PUBLIC`** | ❌ `REVOKED` | ❌ `REVOKED` | ❌ `REVOKED` |
| **`anon`** | ❌ `REVOKED` | ❌ `REVOKED` | ❌ `REVOKED` |
| **`authenticated`** | ❌ `REVOKED` | ❌ `REVOKED` | ❌ `REVOKED` (No Confused Deputy) |
| **`service_role`** | ✅ `GRANTED` | ✅ `GRANTED` | ✅ `GRANTED` |
| **`pettravel_backend_staging`** | ✅ `GRANTED` (Staging) | ✅ `GRANTED` | ✅ `GRANTED` |
| **`pettravel_backend`** | ⚠️ Conditional | ✅ `GRANTED` | ✅ `GRANTED` |
| **`postgres`** (Owner) | ✅ `FULL` | ✅ `FULL` | ✅ `FULL` |

---

## 4. Rollback SQL Execution Script

In the event that V11 must be rolled back, execute the standalone SQL file:
[`supabase/rollback_v11_forward_repair.sql`](file:///d:/Workspace/PetTravel%20WholeSale/supabase/rollback_v11_forward_repair.sql)

```sql
BEGIN;

-- Lock and statement timeouts prevent indefinite queueing behind long transactions
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Restore pt_reserve_order_stock
CREATE OR REPLACE FUNCTION public.pt_reserve_order_stock(
  p_order_id text,
  p_actor_id text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
-- [Complete procedure definition as contained in rollback_v11_forward_repair.sql]
$$;

-- 2. Restore pt_post_order_accounting
CREATE OR REPLACE FUNCTION public.pt_post_order_accounting(
  p_order_id text,
  p_actor_id text,
  p_mode text DEFAULT 'post_all',
  p_vat_rate_bps integer DEFAULT 0,
  p_require_consumed_stock boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
-- [Complete procedure definition as contained in rollback_v11_forward_repair.sql]
$$;

-- 3. ACL Normalization & Privilege Hardening
REVOKE ALL ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) TO service_role;
    GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend_staging') THEN
    GRANT EXECUTE ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) TO pettravel_backend_staging;
    GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO pettravel_backend_staging;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend') THEN
    GRANT EXECUTE ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) TO pettravel_backend;
    GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO pettravel_backend;
  END IF;
END $$;

COMMIT;
```

---

## 5. Lock & Operational Impact

- **Lock Characteristics**: Function replacement via `CREATE OR REPLACE FUNCTION` acquires an `AccessExclusiveLock` on the specific function metadata in `pg_proc`. Expected short metadata lock; exact duration is environment-dependent and must be empirically measured in staging (measured staging median: $< 15\text{ ms}$).
- **Application Availability**: EXPECTED ONLINE / LOW-IMPACT MIGRATION subject to lock acquisition, active transactions, connection pool behavior, `statement_timeout` ($30\text{ s}$), and `lock_timeout` ($5\text{ s}$).
- **Zero Data Loss Guarantee**: No journal lines, receivables, customer orders, or inventory balances are deleted or dropped during rollback.
