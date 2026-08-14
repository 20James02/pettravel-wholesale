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
