from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_arbitrary_sql_rpc_is_removed_and_revoked():
    legacy_migration = (REPO_ROOT / "supabase" / "update_v2.sql").read_text(encoding="utf-8").lower()
    hardening_migration = (REPO_ROOT / "supabase" / "update_v8_drop_exec_sql.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert "create or replace function exec_sql" not in legacy_migration
    assert "revoke execute on function public.exec_sql(text)" in hardening_migration
    assert "drop function if exists public.exec_sql(text)" in hardening_migration


def test_v9_enforces_manager_approval_and_status_contracts():
    sql = (REPO_ROOT / "supabase" / "update_v9_order_workflow_guards.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert "trg_guard_quote_adjustment_approval" in sql
    assert "trg_guard_quote_publication" in sql
    assert "approved_by is null" in sql
    assert "admin_manager" in sql
    assert "customer_orders_commercial_status_check" in sql
    assert "security definer" not in sql


def test_v13_protects_revision_history_and_scoped_realtime_state_with_rls():
    schema = (REPO_ROOT / "supabase" / "schema.sql").read_text(encoding="utf-8").lower()
    migration = (
        REPO_ROOT / "supabase" / "update_v13_order_lifecycle_canonicalization.sql"
    ).read_text(encoding="utf-8").lower()

    for sql in (schema, migration):
        assert "alter table public.order_revision_history enable row level security" in sql or "alter table order_revision_history enable row level security" in sql
        assert "customers can read own order revision history" in sql
        assert "alter table public.order_sync_revisions enable row level security" in sql or "alter table order_sync_revisions enable row level security" in sql
        assert "users can read scoped order sync revisions" in sql

    assert "cannot move adjustments onto an accepted quote version" in migration


def test_v14_enforces_one_pending_proof_per_payment_request():
    schema = (REPO_ROOT / "supabase" / "schema.sql").read_text(encoding="utf-8").lower()
    migration = (
        REPO_ROOT / "supabase" / "update_v14_payment_proof_lifecycle.sql"
    ).read_text(encoding="utf-8").lower()

    assert "v14_duplicate_pending_payment_proofs" in migration
    for sql in (schema, migration):
        assert "uq_payment_proofs_one_pending_per_request" in sql
        assert "where status = 'pending_admin_confirmation'" in sql


def test_v15_distributed_auth_rate_limit_is_private_and_pii_safe():
    schema = (REPO_ROOT / "supabase" / "schema.sql").read_text(encoding="utf-8").lower()
    migration = (
        REPO_ROOT / "supabase" / "update_v15_distributed_auth_rate_limit.sql"
    ).read_text(encoding="utf-8").lower()

    for sql in (schema, migration):
        assert "auth_rate_limit_buckets" in sql
        assert "length(bucket_key) = 64" in sql
        assert "enable row level security" in sql
        assert "idx_auth_rate_limit_buckets_expiry" in sql
    assert "email" not in migration
    assert "phone" not in migration
    assert "ip_address" not in migration


def test_v16_hardens_supabase_advisor_findings_idempotently():
    migration = (
        REPO_ROOT / "supabase" / "update_v16_database_security_performance.sql"
    ).read_text(encoding="utf-8").lower()

    assert "revoke execute on function public.current_app_user_id() from public, anon" in migration
    assert "grant execute on function public.current_app_user_id() to authenticated, service_role" in migration
    assert "revoke execute on function public.post_journal_entry(text, text) from public, anon, authenticated" in migration
    assert "alter function public.protect_posted_journal_lines() set search_path = pg_catalog, public" in migration
    assert "select auth.uid()" in migration
    assert 'create policy "customers can read own order revision history"' in migration
    assert 'create policy "users can read scoped order sync revisions"' in migration
    assert "drop index if exists public.idx_order_rev_history_order_id" in migration
    assert "create index if not exists" in migration
    assert "pg_constraint" in migration
