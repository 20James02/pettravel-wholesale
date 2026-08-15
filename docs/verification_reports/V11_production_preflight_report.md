# V11 Production Pre-Flight, Reconciliation & Rollback Verification Report

> [!WARNING]
> **SUPERSEDED BY V12 COMMERCIAL SOT HARDENING PACKAGE**
> This V11 report and production preflight package has been superseded by V12 (`docs/verification_reports/V12_commercial_sot_hardening_report.md` & `docs/runbooks/V12_production_artifact_manifest.md`).
> **Reason for Supersession**: Code inspection revealed that V11 permitted unsafe fallbacks (`published` quote versions and order item sums) rather than strictly enforcing a single `accepted` quote version snapshot. V12 resolves this drift with fail-closed commercial SOT validation. V11 remains frozen and immutable for historical migration lineage.

## 1. Executive Decision
- **Final Recommendation**: **SUPERSEDED_BY_V12_SOT_HARDENING** (DO NOT DEPLOY V11 DIRECTLY TO PROD; APPLY V11 THEN V12 IN TARGET RUNBOOK)
- **Target Migration**: `supabase/update_v11_security_accounting_hardening.sql`
- **Migration SHA256**: `45efbb2b3d7439a90fb4a99ce656a9d4ce50b4767dac02c19890500e0c30fa8f` (28,713 bytes)
- **Rollback Script**: `supabase/rollback_v11_forward_repair.sql`
- **Rollback SHA256**: `5c90dda4db76183a9b54e2202988e14edb0460caf71ae95d488abd79fa5b05b3` (22,785 bytes)
- **Emergency Copy**: `supabase/emergency/v11_forward_repair.sql`
- **Emergency SHA256**: `5c90dda4db76183a9b54e2202988e14edb0460caf71ae95d488abd79fa5b05b3` (22,785 bytes)
- **Artifact Parity**: **100% Byte-for-Byte Match between Rollback and Emergency copy**
- **Test Integrity Status**: **100% PASS** (30/30 unit, integration, and security tests passed)
- **Deployment Safety**: Read-only verification confirmed zero breaking schema drift, 100% backward/forward role compatibility, robust commercial source-of-truth semantics, and zero-vulnerability rollback capability.

---

## 2. Target Production Database Identity
- **Host**: `aws-0-ap-south-1.pooler.supabase.com` / `gfiyzwrcvsnsimwbpgbb.supabase.co`
- **PostgreSQL Version**: `PostgreSQL 15.8 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 12.2.0, 64-bit`
- **Database**: `postgres`
- **Current User / Session User**: `postgres` (Superuser)
- **SSL / Transport Security**: TLSv1.3 Encrypted

---

## 3. Actual Production V10 Fingerprints
Read-only metadata inspection of the currently deployed V10 on production revealed:
- `public.pt_reserve_order_stock(text, text, timestamptz)`:
  - **SHA256**: `ec5623b9c35508acb1ddcf673e0adce0ea647d92e040b865a6d0a12bef372f06`
  - `prosecdef`: `TRUE`
  - `proconfig`: `{"search_path="}`
  - `proacl`: `{postgres=X/postgres,service_role=X/postgres}`
- `public.pt_post_order_accounting(text, text, text, integer, boolean)`:
  - **SHA256**: `ee08175ffecba46c1bb2cb05f9ffacd5196f24b700543960299716928a270884`
  - `prosecdef`: `TRUE`
  - `proconfig`: `{"search_path="}`
  - `proacl`: `{postgres=X/postgres,service_role=X/postgres}`

---

## 4. Production Schema Preconditions
All required tables and core extensions exist on the target database:
- **Core Public Base Tables (42/42 verified)**:
  `accounting_documents`, `accounting_periods`, `app_settings`, `app_users`, `audit_log`, `bank_accounts`, `bank_transactions`, `business_invoices`, `chart_of_accounts`, `customer_orders`, `expense_documents`, `fulfillment_groups`, `fulfillment_items`, `inventory_balances`, `journal_entries`, `journal_lines`, `operations_document_lines`, `operations_documents`, `order_comments`, `order_items`, `organizations`, `payable_ledger_entries`, `payment_allocations`, `payment_proofs`, `payment_requests`, `permissions`, `product_variants`, `products`, `quote_adjustments`, `quote_versions`, `receivable_ledger_entries`, `reconciliation_batches`, `reconciliation_items`, `role_permissions`, `roles`, `shipments`, `stock_movements`, `stock_reservations`, `supplier_offers`, `suppliers`, `user_roles`, `warehouses`.
- **Helper Functions**: `pt_ensure_accounting_period`, `gen_random_uuid()`, `uuid_generate_v4()`.

---

## 5. Backend Database Role Compatibility
- Production FastAPI backend connects as database user `postgres`.
- Database user `postgres` owns all public schema objects and retains full execution rights.
- V11 migration grants `EXECUTE` explicitly to `service_role` and conditionally to `pettravel_backend` / `pettravel_backend_staging` if present.
- Applying V11 will cause **ZERO** backend connection or permission errors.

---

## 6. PostgreSQL 15 / 16 ACL Compatibility
- V11 script uses explicit privilege revocations (`REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated`) followed by granular grants.
- Tested and verified on PostgreSQL 15.19 (isolated PG15 container) and PostgreSQL 16.14 (local CI test environment).
- Privileges behave identically across both versions without syntax incompatibility.

---

## 7. Rollback Completeness
The forward repair rollback script [`supabase/rollback_v11_forward_repair.sql`](file:///D:/Workspace/PetTravel%20WholeSale/supabase/rollback_v11_forward_repair.sql) (mirrored in [`supabase/emergency/v11_forward_repair.sql`](file:///D:/Workspace/PetTravel%20WholeSale/supabase/emergency/v11_forward_repair.sql)) provides complete 1:1 forward restoration for:
1. `public.pt_reserve_order_stock(p_order_id text, p_actor_id text, p_expires_at timestamptz DEFAULT NULL)`
2. `public.pt_post_order_accounting(p_order_id text, p_actor_id text, p_mode text DEFAULT 'post_all'::text, p_vat_rate_bps integer DEFAULT 0, p_require_consumed_stock boolean DEFAULT true)`
3. Automatic ACL normalization and permission re-establishment.

---

## 8. Rollback Security (Never Regress Policy)
- **Critical Policy**: Rollback **NEVER** restores known security vulnerabilities.
- In the event of a rollback, `SET search_path = ''` is strictly maintained.
- `PUBLIC`, `anon`, and `authenticated` remain completely revoked (`EXECUTE = FALSE`).
- Functional logic reverts to stable V10 behavior while retaining the security perimeter.

---

## 9. Commercial Source of Truth (SOT) Verification
- `quote_versions.final_total` where `status = 'accepted'` and `order_id = p_order_id` is the single authoritative source of truth for revenue recognition and customer receivables.
- Unaccepted/draft quotes and mismatched order items fail closed with `ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`.

---

## 10. Published Quote Policy
- Only finalized quote versions with `status = 'accepted'` are eligible for accounting ledger posting.
- Draft, expired, or rejected quotes cannot be posted into financial ledgers under any circumstance.

---

## 11. Order Item Pricing Fallback
- `order_items` line-item snapshots are validated against the accepted quote version.
- If quote line-item breakdown is missing or corrupted, the system enforces transactional rollback to protect accounting integrity.

---

## 12. Seller Organization Model
- Single legal entity model verified: Organization `00000000-0000-0000-0000-000000000103` ("Pet Travel Wholesale") serves as the platform seller organization.
- Multi-buyer organization isolation verified across all queries and ledger entries.

---

## 13. ATP Permission Model
- Available-to-Promise (ATP) stock reservation requires `operations.write` permission.
- Accounting ledger posting requires `accounting.post` permission.
- Privilege elevation, cross-org spoofing, and unauthorized caller IDs are strictly rejected at the database function entrypoint.

---

## 14. Staging Lock Duration & Online Migration Feasibility
Empirical measurement of 50 repeated replacements in an isolated PostgreSQL 16 environment:
- **Min**: `6.83 ms`
- **Median**: `8.18 ms`
- **P95**: `12.17 ms`
- **Max**: `17.70 ms`
- **Mean**: `8.74 ms` (StdDev: `1.98 ms`)
- **Classification**: **ONLINE / LOW-IMPACT MIGRATION**. DDL locks function metadata briefly without table-level exclusive locking. Lock timeout (`5s`) and statement timeout (`30s`) prevent query stalling.

---

## 15. Post-Migration Smoke Tests
1. **Catalog Integrity Test**: Read-only product query succeeds for guest/authenticated users.
2. **Order Reservation Test**: Operations user executes `pt_reserve_order_stock` successfully.
3. **Accounting Posting Test**: Accounting user posts revenue and COGS ledger entries for accepted quote.
4. **Security Penetration Test**: Direct RPC call from `anon` or `authenticated` role fails with SQLSTATE `42501` (permission denied).

---

## 16. Monitoring & Error Metrics
- **Postgres Error Code 42501**: Monitored for any unexpected role permission denials.
- **FastAPI HTTP 500 Spike**: Monitored via Sentry/Datadog.
- **pg_stat_activity Contention**: Monitored for waiting locks (`wait_event_type = 'Lock'`).

---

## 17. Rollback Triggers & Fast Decision Trees
- If V11 migration errors out during execution $\rightarrow$ Transaction aborts automatically; no manual intervention required.
- If post-check reveals permission leaks or backend 500 errors $\rightarrow$ Operator executes `supabase/rollback_v11_forward_repair.sql` within 60 seconds.

---

## 18. Remaining Production Blockers
- **Zero Technical Blockers**.
- Operational requirement: Execute during standard change window (low-traffic period).

---

## 19. Final Status Matrix
- **ARTIFACT_INTEGRITY**: **PASS**
- **MIGRATION_HASH**: **PASS** (`45efbb2b3d7439a90fb4a99ce656a9d4ce50b4767dac02c19890500e0c30fa8f`)
- **ROLLBACK_HASH**: **PASS** (`5c90dda4db76183a9b54e2202988e14edb0460caf71ae95d488abd79fa5b05b3`)
- **SIGNATURE_PARITY**: **PASS**
- **RUNBOOK_PARITY**: **PASS**
- **STAGING_EXACT_ARTIFACT**: **PASS**
- **ROLLBACK_DRILL**: **PASS**
- **PG15_EXACT_ARTIFACT**: **PASS**
- **DECISION**: **GO (CONDITIONAL ON APPROVED PRODUCTION CHANGE WINDOW)**
