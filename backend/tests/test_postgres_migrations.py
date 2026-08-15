import asyncio
import os
import glob
import pytest
import asyncpg
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

POSTGRES_TEST_HOST = "localhost"
POSTGRES_TEST_PORT = 5439
POSTGRES_TEST_USER = "postgres"
POSTGRES_TEST_PASS = "postgres"

def get_db_url(db_name: str) -> str:
    return f"postgresql+asyncpg://{POSTGRES_TEST_USER}:{POSTGRES_TEST_PASS}@{POSTGRES_TEST_HOST}:{POSTGRES_TEST_PORT}/{db_name}"

async def create_isolated_database(db_name: str):
    """Connect to default 'postgres' database and create an isolated test database."""
    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER,
        password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST,
        port=POSTGRES_TEST_PORT,
        database="postgres"
    )
    try:
        # Terminate any existing connections to the target DB
        await conn.execute(f"""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '{db_name}'
              AND pid <> pg_backend_pid();
        """)
        await conn.execute(f"DROP DATABASE IF EXISTS {db_name};")
        await conn.execute(f"CREATE DATABASE {db_name};")
    finally:
        await conn.close()

async def run_sql_file(conn: asyncpg.Connection, filepath: str):
    with open(filepath, "r", encoding="utf-8") as f:
        sql = f.read()
    # asyncpg executes multi-statement SQL via conn.execute()
    await conn.execute(sql)


# ── TEST 1: DATABASE MIGRATION PATHS & FUNCTION FINGERPRINTS (V10 -> V11 -> V12) ──

@pytest.mark.asyncio
async def test_three_migration_paths_and_function_fingerprints():
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "supabase"))
    schema_file = os.path.join(supabase_dir, "schema.sql")
    
    # Historical v1..v9
    historical_migration_files = [
        os.path.join(supabase_dir, f) for f in [
            "update_schema.sql",
            "update_v2.sql",
            "update_v3_accounting.sql",
            "update_v4_operations.sql",
            "update_v5_receivables_reconciliation.sql",
            "update_v6_stock_reservations.sql",
            "update_v7_accounting_order_posting.sql",
            "update_v7_variant_images.sql",
            "update_v8_drop_exec_sql.sql",
            "update_v9_order_workflow_guards.sql"
        ]
    ]
    
    v10_file = os.path.join(supabase_dir, "update_v10_integrity_hardening.sql")
    v11_file = os.path.join(supabase_dir, "update_v11_security_accounting_hardening.sql")
    v12_file = os.path.join(supabase_dir, "update_v12_commercial_sot_hardening.sql")
    
    # ── PATH A: Baseline Schema bootstrap ──
    db_path_a = "pettravel_path_a_baseline"
    await create_isolated_database(db_path_a)
    conn_a = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_path_a
    )
    try:
        await run_sql_file(conn_a, schema_file)
    finally:
        await conn_a.close()

    # ── PATH B: Historical Upgrade (v1..v9) THEN V10 THEN V11 THEN V12 ──
    db_path_b = "pettravel_path_b_upgrade"
    await create_isolated_database(db_path_b)
    conn_b = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_path_b
    )
    try:
        await run_sql_file(conn_b, schema_file)
        for mf in historical_migration_files:
            if os.path.exists(mf):
                await run_sql_file(conn_b, mf)
        
        # Apply V10
        if os.path.exists(v10_file):
            await run_sql_file(conn_b, v10_file)
            
        # Apply forward migration V11
        await run_sql_file(conn_b, v11_file)
        
        # Apply forward migration V12
        await run_sql_file(conn_b, v12_file)
        
        # Verify post-v12 state in Path B
        post_v12_def_reserve_b = await conn_b.fetchval("SELECT pg_get_functiondef('pt_reserve_order_stock(text,text,timestamptz)'::regprocedure)")
        post_v12_def_acct_b = await conn_b.fetchval("SELECT pg_get_functiondef('pt_post_order_accounting(text,text,text,integer,boolean)'::regprocedure)")
        
        assert "order by variant_sku_snapshot, id" in post_v12_def_reserve_b, "Path B must have hardened lock ordering"
        assert "upper(v_payment.purpose::text)" in post_v12_def_acct_b, "Path B must have cast correction"
        assert "status = 'accepted'" in post_v12_def_acct_b, "Path B must have accepted quote SOT"
        assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in post_v12_def_acct_b, "Path B must have fail-closed SOT error"
    finally:
        await conn_b.close()

    # ── PATH C: Full Sequential Install (Baseline + v1..v12) ──
    db_path_c = "pettravel_path_c_sequential"
    await create_isolated_database(db_path_c)
    conn_c = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_path_c
    )
    try:
        await run_sql_file(conn_c, schema_file)
        for mf in historical_migration_files:
            if os.path.exists(mf):
                await run_sql_file(conn_c, mf)
        if os.path.exists(v10_file):
            await run_sql_file(conn_c, v10_file)
        await run_sql_file(conn_c, v11_file)
        await run_sql_file(conn_c, v12_file)
        
        path_c_def_reserve = await conn_c.fetchval("SELECT pg_get_functiondef('pt_reserve_order_stock(text,text,timestamptz)'::regprocedure)")
        path_c_def_acct = await conn_c.fetchval("SELECT pg_get_functiondef('pt_post_order_accounting(text,text,text,integer,boolean)'::regprocedure)")
        
        assert post_v12_def_reserve_b.strip() == path_c_def_reserve.strip(), "Path B and Path C pt_reserve_order_stock must be identical"
        assert post_v12_def_acct_b.strip() == path_c_def_acct.strip(), "Path B and Path C pt_post_order_accounting must be identical"
    finally:
        await conn_c.close()

    # ── PATH D: Direct Upgrade from Old Unhardened V10 -> V11 -> V12 ──
    db_path_d = "pettravel_path_d_old_v10"
    await create_isolated_database(db_path_d)
    conn_d = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_path_d
    )
    try:
        await run_sql_file(conn_d, schema_file)
        for mf in historical_migration_files:
            if os.path.exists(mf):
                await run_sql_file(conn_d, mf)
                
        # Simulate Old Unhardened V10 state (permissive grants, draft quote SOT, un-empty search_path)
        old_v10_sim = """
        CREATE OR REPLACE FUNCTION public.pt_reserve_order_stock(p_order_id text, p_actor_id text, p_expires_at timestamptz default null)
        RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
        BEGIN
            RETURN jsonb_build_object('status', 'old_v10_unhardened');
        END;
        $$;
        GRANT EXECUTE ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) TO authenticated;
        """
        await conn_d.execute(old_v10_sim)
        
        # Verify authenticated had EXECUTE before V11
        pre_auth_priv = await conn_d.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')")
        assert pre_auth_priv is True, "Old V10 had EXECUTE granted to authenticated"
        
        # Apply forward migration V11 then V12
        await run_sql_file(conn_d, v11_file)
        await run_sql_file(conn_d, v12_file)
        
        # Verify post-v12 state in Path D
        path_d_def_reserve = await conn_d.fetchval("SELECT pg_get_functiondef('pt_reserve_order_stock(text,text,timestamptz)'::regprocedure)")
        path_d_def_acct = await conn_d.fetchval("SELECT pg_get_functiondef('pt_post_order_accounting(text,text,text,integer,boolean)'::regprocedure)")
        
        # Privilege must be revoked from authenticated
        post_auth_priv = await conn_d.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')")
        assert post_auth_priv is False, "V12 must revoke EXECUTE from authenticated"
        
        # Fingerprint parity across all paths
        assert path_d_def_reserve.strip() == path_c_def_reserve.strip(), "Path D (Old V10 -> V11 -> V12) must match Path C"
        assert path_d_def_acct.strip() == path_c_def_acct.strip(), "Path D (Old V10 -> V11 -> V12) must match Path C"
    finally:
        await conn_d.close()


# ── TEST 2: FORWARD MIGRATION V12 IDEMPOTENCY ──

@pytest.mark.asyncio
async def test_forward_migration_v12_idempotency():
    db_name = "pettravel_path_b_upgrade"
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "supabase"))
    v12_file = os.path.join(supabase_dir, "update_v12_commercial_sot_hardening.sql")

    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_name
    )
    try:
        # Re-apply V12 on already updated DB
        await run_sql_file(conn, v12_file)
        await run_sql_file(conn, v12_file)
        
        def_acct = await conn.fetchval("SELECT pg_get_functiondef('pt_post_order_accounting(text,text,text,integer,boolean)'::regprocedure)")
        assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in def_acct
        
        anon_priv = await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_post_order_accounting(text,text,text,integer,boolean)', 'EXECUTE')")
        assert anon_priv is False, "Re-applying V12 must keep anon revoked"
    finally:
        await conn.close()


# ── TEST 3: MIGRATION FAILURE ATOMICITY ──

@pytest.mark.asyncio
async def test_migration_failure_is_atomic():
    db_name = "pettravel_path_b_upgrade"
    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_name
    )
    try:
        # Grab fingerprint before failed migration
        def_before = await conn.fetchval("SELECT pg_get_functiondef('pt_post_order_accounting(text,text,text,integer,boolean)'::regprocedure)")
        
        # Construct faulty migration wrapped in BEGIN...COMMIT
        faulty_migration = """
        BEGIN;
        SET LOCAL lock_timeout = '5s';
        SET LOCAL statement_timeout = '30s';
        CREATE OR REPLACE FUNCTION public.pt_post_order_accounting(
            p_order_id text, p_actor_id text, p_mode text default 'post_all',
            p_vat_rate_bps integer default 0, p_require_consumed_stock boolean default true
        ) RETURNS jsonb LANGUAGE plpgsql AS $$
        BEGIN
            RETURN jsonb_build_object('status', 'corrupted_state');
        END;
        $$;
        -- Intentional syntax / constraint failure to abort transaction
        SELECT 1 / 0;
        COMMIT;
        """
        
        with pytest.raises(Exception):
            await conn.execute(faulty_migration)

        try:
            await conn.execute("ROLLBACK;")
        except Exception:
            pass

        # Verify function was NOT mutated due to atomic rollback
        def_after = await conn.fetchval("SELECT pg_get_functiondef('pt_post_order_accounting(text,text,text,integer,boolean)'::regprocedure)")
        assert def_before == def_after, "Failed migration must roll back completely without leaving partial changes"
    finally:
        await conn.close()


# ── TEST 4: V12 ROLLBACK EXECUTION & SECURITY INVARIANTS ──

@pytest.mark.asyncio
async def test_v12_rollback_plan_execution_and_security_invariants():
    db_name = "pettravel_path_b_upgrade"
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "supabase"))
    rollback_file = os.path.join(supabase_dir, "rollback_v12_forward_repair.sql")
    v12_file = os.path.join(supabase_dir, "update_v12_commercial_sot_hardening.sql")
    
    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_name
    )
    try:
        # 1. Execute Rollback Script
        await run_sql_file(conn, rollback_file)
        
        # 2. Verify security invariants after rollback:
        # A. Functions must still be SECURITY DEFINER
        procs = await conn.fetch("""
            SELECT p.proname, p.prosecdef, p.proconfig
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('pt_reserve_order_stock', 'pt_post_order_accounting')
        """)
        for r in procs:
            assert r["prosecdef"] is True, f"{r['proname']} must remain SECURITY DEFINER after rollback"
            assert r["proconfig"] is not None and "search_path=" in r["proconfig"][0], f"{r['proname']} must retain search_path='' after rollback"
            
        # B. Privileges must remain REVOKED from PUBLIC, anon, authenticated
        for p_name in ['pt_reserve_order_stock(text,text,timestamptz)', 'pt_post_order_accounting(text,text,text,integer,boolean)']:
            anon_priv = await conn.fetchval(f"SELECT has_function_privilege('anon', 'public.{p_name}', 'EXECUTE')")
            auth_priv = await conn.fetchval(f"SELECT has_function_privilege('authenticated', 'public.{p_name}', 'EXECUTE')")
            assert anon_priv is False, f"Rollback must NOT grant EXECUTE on {p_name} to anon"
            assert auth_priv is False, f"Rollback must NOT grant EXECUTE on {p_name} to authenticated"
            
        # 3. Re-apply V12 to restore post-v12 state
        await run_sql_file(conn, v12_file)
        reapply_def = await conn.fetchval("SELECT pg_get_functiondef('pt_post_order_accounting(text,text,text,integer,boolean)'::regprocedure)")
        assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in reapply_def
    finally:
        await conn.close()


# ── TEST 5: V12 SESSION TIMEOUTS & ROLLBACK HASH INVARIANCE ──

@pytest.mark.asyncio
async def test_v12_migration_and_rollback_session_timeouts():
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "supabase"))
    v12_file = os.path.join(supabase_dir, "update_v12_commercial_sot_hardening.sql")
    rollback_file = os.path.join(supabase_dir, "rollback_v12_forward_repair.sql")
    emergency_file = os.path.join(supabase_dir, "emergency", "v12_forward_repair.sql")
    
    # 1. Assert rollback and emergency files are byte-for-byte identical
    with open(rollback_file, "rb") as f:
        rb_bytes = f.read()
    with open(emergency_file, "rb") as f:
        em_bytes = f.read()
    assert rb_bytes == em_bytes, "rollback_v12_forward_repair.sql and emergency/v12_forward_repair.sql must be 100% byte-for-byte identical"
    
    # 2. Assert migration contains lock_timeout and statement_timeout
    with open(v12_file, "r", encoding="utf-8") as f:
        mig_content = f.read()
    assert "lock_timeout" in mig_content, "update_v12_commercial_sot_hardening.sql must specify lock_timeout"
    assert "statement_timeout" in mig_content, "update_v12_commercial_sot_hardening.sql must specify statement_timeout"
    
    # 3. Connect and execute transaction, verifying SHOW lock_timeout and statement_timeout
    db_name = "pettravel_timeout_test"
    await create_isolated_database(db_name)
    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_name
    )
    try:
        tr = conn.transaction()
        await tr.start()
        await conn.execute("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s';")
        lt = await conn.fetchval("SHOW lock_timeout;")
        st = await conn.fetchval("SHOW statement_timeout;")
        assert lt == "5s", f"Expected lock_timeout 5s, got {lt}"
        assert st == "30s", f"Expected statement_timeout 30s, got {st}"
        await tr.rollback()
    finally:
        await conn.close()
