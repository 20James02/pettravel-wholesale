# Pet Travel Wholesale — V12 Production Artifact Manifest

## Document Control
- **Document**: `docs/runbooks/V12_production_artifact_manifest.md`
- **Release Version**: V12 (Commercial SOT Fail-Closed Hardening)
- **Supersedes**: V11 Production Package (`docs/runbooks/V11_production_artifact_manifest.md`)
- **Status**: FROZEN & VERIFIED
- **Date**: 2026-08-16

---

## 1. Immutable Artifact Cryptographic Manifest

| Artifact File | Role | SHA-256 Checksum | Byte Size | Lines | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `supabase/update_v12_commercial_sot_hardening.sql` | Forward Migration | `5602199ed3f728a01928dd4aec53976e162c2148b8379dae279c147f71eff0aa` | 20,625 B | 646 | **FROZEN** |
| `supabase/rollback_v12_forward_repair.sql` | Rollback Repair | `facf7a825516efc44127feb4ac36b2827726e7166b805e3f52814404706e957c` | 18,978 B | 621 | **FROZEN** |
| `supabase/emergency/v12_forward_repair.sql` | Emergency Mirror | `facf7a825516efc44127feb4ac36b2827726e7166b805e3f52814404706e957c` | 18,978 B | 621 | **FROZEN (1:1 Mirror)** |

### Historical Upstream Artifacts (Immutable References)
| Artifact File | Role | SHA-256 Checksum | Byte Size | Lines | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `supabase/update_v11_security_accounting_hardening.sql` | V11 Forward Migration | `45efbb2b3d7439a90fb4a99ce656a9d4ce50b4767dac02c19890500e0c30fa8f` | 28,713 B | 861 | **IMMUTABLE** |
| `supabase/rollback_v11_forward_repair.sql` | V11 Rollback Repair | `5c90dda4db76183a9b54e2202988e14edb0460caf71ae95d488abd79fa5b05b3` | 22,785 B | 572 | **IMMUTABLE** |

---

## 2. Release Gate Invariants & Behavioral Guarantees

### Commercial Source of Truth (SOT) Rules
1. **Unambiguous Accepted Quote Requirement**:
   - `quote_versions` WHERE `status = 'accepted'` AND `final_total > 0` is the single source of truth for sale recognition (`recognize_sale` / `post_all`).
   - If count of accepted quote versions $> 1$, transaction aborts immediately with `ACCOUNTING_COMMERCIAL_SNAPSHOT_AMBIGUOUS`.
   - If count of accepted quote versions $= 0$ or `final_total <= 0`, transaction aborts immediately with `ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING`.
2. **Zero Fallback Toleration**:
   - Removed all fallbacks to `published` quotes or order item calculations.
   - Removed `SUM(order_items.quantity * order_items.unit_price_snapshot)` fallback.
3. **Payment Mode Separation**:
   - `post_confirmed_payments` mode posts confirmed customer payment requests without requiring an accepted quote version.
4. **Defensive Security Standard**:
   - `SECURITY DEFINER` on all procedures.
   - Explicit `SET search_path = ''`.
   - Complete revocation from `PUBLIC`, `anon`, `authenticated`.
   - Dedicated grants to `service_role`, `postgres`, `pettravel_backend_staging`, and `pettravel_backend`.
   - `SET LOCAL lock_timeout = '5s'` and `SET LOCAL statement_timeout = '30s'`.

---

## 3. Verification & Test Evidence Summary

- **PostgreSQL Test Suite**: 31 / 31 tests passing (100%) in `backend/tests/test_postgres_migrations.py` and `backend/tests/test_real_postgres.py`.
- **Backend Full Suite**: 80 / 80 tests passing (100%) in `backend/tests/`.
- **Frontend Full Suite**: 23 / 23 tests passing (100%) in `frontend/src/`.
- **Frontend Next.js Build**: Successful production Turbopack compilation with 0 lint/type errors.
- **Commercial SOT Matrix**: Cases A through J tested and verified with zero financial side effects on failure.
- **Rollback Parity**: Verified byte-for-byte SHA256 match between `rollback_v12_forward_repair.sql` and `emergency/v12_forward_repair.sql`.
