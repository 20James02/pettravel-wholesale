# Pet Travel Wholesale — V12 Commercial SOT Hardening Verification Report

## Document Control
- **Document**: `docs/verification_reports/V12_commercial_sot_hardening_report.md`
- **Release Version**: V12 (Commercial SOT Fail-Closed Hardening)
- **Status**: PASSED / READY FOR STAGING DEPLOYMENT
- **Date**: 2026-08-16

---

## 1. Executive Summary

Following the discovery of unsafe commercial source-of-truth fallbacks in earlier iterations, migration `V12` (`supabase/update_v12_commercial_sot_hardening.sql`) was developed and verified to make accounting Commercial SOT completely unambiguous, deterministic, and fail-closed.

All post-V11 corrections have been authored as a clean forward migration on top of immutable V11, with 100% automated test coverage across PostgreSQL 15 and PostgreSQL 16 environments.

---

## 2. Commercial SOT Policy & Invariants

### 2.1 Formal Policy Definition
- **Commercial Snapshot Requirement**: Sale recognition (`recognize_sale` and the sale portion of `post_all`) requires a single immutable committed commercial snapshot.
- **Allowed Source**: An explicit `quote_versions` record with `status = 'accepted'` and `final_total > 0`.
- **Disallowed Sources**:
  - `status = 'published'` (even if order status is `customer_accepted` or `locked`)
  - `status = 'draft'`
  - Fallback to `SUM(order_items.quantity * order_items.unit_price_snapshot)`
  - Arbitrary latest quote or mutable cart prices
- **Multiple Accepted Quotes**: If $>1$ quote version is marked `accepted`, abort transaction with `ACCOUNTING_COMMERCIAL_SNAPSHOT_AMBIGUOUS`.
- **Missing / Non-Positive Accepted Quote**: If $=0$ accepted quote versions or `final_total <= 0`, abort transaction with `ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`.

### 2.2 Commercial SOT Verification Matrix (A..J)

| Case | Scenario Description | Expected Outcome | Verification Status |
| :--- | :--- | :--- | :--- |
| **Case A** | Accepted V1 (1,000,000) + Draft V2 (1,500,000) | Posts 1,000,000 against Accepted V1 | **PASSED** |
| **Case B** | Accepted V1 (1,000,000) + Published V2 (1,200,000) | Posts 1,000,000 against Accepted V1 | **PASSED** |
| **Case C** | Published V1 (800,000) only, order `customer_accepted` | Fails closed (`ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`), 0 side effects | **PASSED** |
| **Case D** | Published V1 (900,000) only, order `locked` | Fails closed (`ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`), 0 side effects | **PASSED** |
| **Case E** | Draft V1 (950,000) only | Fails closed (`ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`), 0 side effects | **PASSED** |
| **Case F** | No quote versions, order items exist | Fails closed (`ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`), 0 side effects | **PASSED** |
| **Case G** | No quote versions, no order items | Fails closed (`ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`), 0 side effects | **PASSED** |
| **Case H** | Accepted V1 with `final_total <= 0` | Fails closed (`ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`), 0 side effects | **PASSED** |
| **Case I** | Two Accepted quotes (V1 + V2) | Fails closed (`ACCOUNTING_COMMERCIAL_SNAPSHOT_AMBIGUOUS`), 0 side effects | **PASSED** |
| **Case J** | `post_confirmed_payments` only (deposit) | Posts deposit receipt without requiring accepted quote | **PASSED** |

---

## 3. Migration Paths Verified

1. **Path P1 (Old V10 -> V11 -> V12)**:
   - Simulates upgrading directly from production baseline to V11, then to V12.
   - Result: **PASSED**.
2. **Path P2 (Staging V11 -> V12)**:
   - Simulates applying V12 forward migration onto the existing Staging database where V11 is already applied.
   - Result: **PASSED**.
3. **Path P3 (Baseline -> Historical -> V10 -> V11 -> V12)**:
   - Full fresh build path from empty database to current head.
   - Result: **PASSED**.

---

## 4. Rollback & Forward Repair Drills

- **V12 Rollback Script**: `supabase/rollback_v12_forward_repair.sql`
- **V12 Emergency Mirror**: `supabase/emergency/v12_forward_repair.sql` (1:1 SHA-256 match)
- **Rollback Invariants**:
  - Reverts procedure definitions safely without dropping tables or altering ledger data.
  - Maintains `SECURITY DEFINER`, `search_path = ''`, and explicit role grants.
  - Session timeout guards preserved (`lock_timeout = '5s'`, `statement_timeout = '30s'`).
- **Drill Execution**: `V12 Applied -> Rollback Executed -> Invariants Verified -> V12 Reapplied -> Reapply Verified`. Result: **PASSED**.

---

## 5. Artifact Cryptographic Freeze

- `supabase/update_v12_commercial_sot_hardening.sql`:
  - SHA256: `5602199ed3f728a01928dd4aec53976e162c2148b8379dae279c147f71eff0aa` (20,625 bytes, 646 lines)
- `supabase/rollback_v12_forward_repair.sql`:
  - SHA256: `facf7a825516efc44127feb4ac36b2827726e7166b805e3f52814404706e957c` (18,978 bytes, 621 lines)
- `supabase/emergency/v12_forward_repair.sql`:
  - SHA256: `facf7a825516efc44127feb4ac36b2827726e7166b805e3f52814404706e957c` (18,978 bytes, 621 lines)
