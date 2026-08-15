# V11 Production Artifact Manifest

## V11 MIGRATION
- **Path**: `supabase/update_v11_security_accounting_hardening.sql`
- **Size**: `28713` bytes
- **SHA256**: `45efbb2b3d7439a90fb4a99ce656a9d4ce50b4767dac02c19890500e0c30fa8f`
- **Git commit**: `9ba82e99ca7935646e7cbb5c071d042edc980096`
- **Tested PG versions**: PostgreSQL 15.19, PostgreSQL 16.14
- **Staging tested**: YES (Passed 100%)
- **Canonical Reserve Signature**: `public.pt_reserve_order_stock(p_order_id text, p_actor_id text, p_expires_at timestamptz DEFAULT NULL)` -> `jsonb`
- **Canonical Accounting Signature**: `public.pt_post_order_accounting(p_order_id text, p_actor_id text, p_mode text DEFAULT 'post_all'::text, p_vat_rate_bps integer DEFAULT 0, p_require_consumed_stock boolean DEFAULT true)` -> `jsonb`
- **Timestamp**: `2026-08-16T03:14:00+07:00`

---

## V11 ROLLBACK
- **Path**: `supabase/rollback_v11_forward_repair.sql`
- **Size**: `22785` bytes
- **SHA256**: `5c90dda4db76183a9b54e2202988e14edb0460caf71ae95d488abd79fa5b05b3`
- **Git commit**: `9ba82e99ca7935646e7cbb5c071d042edc980096`
- **Staging rollback tested**: YES (Passed 100%)
- **Security Invariant**: `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE ALL FROM PUBLIC, anon, authenticated`
- **Timestamp**: `2026-08-16T03:14:00+07:00`

---

## EMERGENCY COPY
- **Path**: `supabase/emergency/v11_forward_repair.sql`
- **Size**: `22785` bytes
- **SHA256**: `5c90dda4db76183a9b54e2202988e14edb0460caf71ae95d488abd79fa5b05b3`
- **Identical to canonical rollback**: **YES** (100% Byte-for-byte Match)
- **Timestamp**: `2026-08-16T03:14:00+07:00`
