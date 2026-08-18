import asyncio
import os
import glob
import pytest
import asyncpg
from sqlalchemy import text

POSTGRES_TEST_HOST = os.environ.get("POSTGRES_TEST_HOST", "127.0.0.1")
POSTGRES_TEST_PORT = int(os.environ.get("POSTGRES_TEST_PORT", "5439"))
POSTGRES_TEST_USER = os.environ.get("POSTGRES_TEST_USER", "postgres")
POSTGRES_TEST_PASS = os.environ.get("POSTGRES_TEST_PASS", "postgres")


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
    await conn.execute(sql)


# ── TEST 1: DATABASE MIGRATION PATHS (V10 -> V11 -> V12 -> V13) ──

@pytest.mark.asyncio
async def test_migration_paths_and_v13_lifecycle_hardening():
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "supabase"))
    fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "fixtures"))
    schema_file = os.path.join(supabase_dir, "schema.sql")
    schema_v12_file = os.path.join(fixtures_dir, "schema_v12_snapshot.sql")
    v13_file = os.path.join(supabase_dir, "update_v13_order_lifecycle_canonicalization.sql")
    
    # ── PATH A: Fresh Schema Bootstrap (from full schema.sql) ──
    db_path_a = "pettravel_path_a_fresh_v13"
    await create_isolated_database(db_path_a)
    conn_a = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_path_a
    )
    try:
        await run_sql_file(conn_a, schema_file)
        
        has_rev_table = await conn_a.fetchval("SELECT 1 FROM information_schema.tables WHERE table_name = 'order_revision_history'")
        assert has_rev_table == 1, "Path A must have order_revision_history table"
        
        has_sync_table = await conn_a.fetchval("SELECT 1 FROM information_schema.tables WHERE table_name = 'order_sync_revisions'")
        assert has_sync_table == 1, "Path A must have order_sync_revisions table"
        
        has_immut_trg = await conn_a.fetchval("""
            SELECT 1 FROM information_schema.triggers 
            WHERE trigger_name = 'trg_guard_accepted_quote_immutability'
        """)
        assert has_immut_trg == 1, "Path A must have accepted quote immutability trigger"
    finally:
        await conn_a.close()

    # ── PATH B: True Upgrade from V12 Baseline -> Apply V13 Migration ──
    db_path_b = "pettravel_path_b_upgrade_v13"
    await create_isolated_database(db_path_b)
    conn_b = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_path_b
    )
    try:
        # 1. Bootstrap from pure V12 snapshot
        await run_sql_file(conn_b, schema_v12_file)
        
        # Verify pre-conditions: V13 objects MUST be absent
        has_rev_before = await conn_b.fetchval("SELECT 1 FROM information_schema.tables WHERE table_name = 'order_revision_history'")
        assert has_rev_before is None, "V12 baseline must NOT have order_revision_history"

        has_sync_before = await conn_b.fetchval("SELECT 1 FROM information_schema.tables WHERE table_name = 'order_sync_revisions'")
        assert has_sync_before is None, "V12 baseline must NOT have order_sync_revisions"

        has_active_org_before = await conn_b.fetchval("""
            SELECT 1 FROM pg_indexes WHERE indexname = 'uq_customer_orders_active_org'
        """)
        assert has_active_org_before is None, "V12 baseline must NOT have uq_customer_orders_active_org"

        # 2. Apply V13 Migration in place
        await run_sql_file(conn_b, v13_file)
        
        # Verify post-conditions: V13 objects MUST be present
        has_rev_after = await conn_b.fetchval("SELECT 1 FROM information_schema.tables WHERE table_name = 'order_revision_history'")
        assert has_rev_after == 1, "Path B must have order_revision_history table after V13 migration"

        has_sync_after = await conn_b.fetchval("SELECT 1 FROM information_schema.tables WHERE table_name = 'order_sync_revisions'")
        assert has_sync_after == 1, "Path B must have order_sync_revisions table after V13 migration"

        has_active_org_idx = await conn_b.fetchval("""
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'uq_customer_orders_active_org'
        """)
        assert has_active_org_idx == 1, "Path B must have uq_customer_orders_active_org index"

        has_single_accepted_idx = await conn_b.fetchval("""
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'uq_quote_versions_single_accepted'
        """)
        assert has_single_accepted_idx == 1, "Path B must have uq_quote_versions_single_accepted index"

        has_immut_trg_b = await conn_b.fetchval("""
            SELECT 1 FROM information_schema.triggers 
            WHERE trigger_name = 'trg_guard_accepted_quote_immutability'
        """)
        assert has_immut_trg_b == 1, "Path B must have accepted quote immutability trigger"
    finally:
        await conn_b.close()


# ── TEST 2: V13 PREFLIGHT DIRTY DATA FAILURE ──

@pytest.mark.asyncio
async def test_v13_migration_preflight_aborts_on_dirty_active_orders():
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "supabase"))
    fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "fixtures"))
    schema_v12_file = os.path.join(fixtures_dir, "schema_v12_snapshot.sql")
    v13_file = os.path.join(supabase_dir, "update_v13_order_lifecycle_canonicalization.sql")
    
    db_dirty = "pettravel_v13_dirty_test"
    await create_isolated_database(db_dirty)
    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_dirty
    )
    try:
        # Load pure V12 schema (which has no active org unique index)
        await run_sql_file(conn, schema_v12_file)
        
        # Seed organizations and users
        await conn.execute("INSERT INTO organizations (id, name) VALUES ('org_dirty', 'Dirty Org');")
        await conn.execute("""
            INSERT INTO app_users (id, organization_id, full_name, email, status)
            VALUES ('user_dirty', 'org_dirty', 'User D', 'dirty@example.com', 'active');
        """)
        
        # Seed duplicate active orders for same org in V12 state
        await conn.execute("""
            INSERT INTO customer_orders 
            (id, order_number, organization_id, created_by, commercial_status, fulfillment_status, payment_intent)
            VALUES 
            ('ord_d1', 'PTW-D1', 'org_dirty', 'user_dirty', 'submitted', 'not_started', 'deposit_cod'),
            ('ord_d2', 'PTW-D2', 'org_dirty', 'user_dirty', 'quoted', 'supplier_checking', 'deposit_cod');
        """)
        
        # Applying V13 MUST fail in preflight check
        with pytest.raises(asyncpg.exceptions.PostgresError) as excinfo:
            await run_sql_file(conn, v13_file)
        
        assert "V13_ACTIVE_ORDER_DUPLICATES_FOUND" in str(excinfo.value)
    finally:
        await conn.close()


# ── TEST 3: V13 IMMUTABILITY TRIGGERS IN REAL POSTGRES ──

@pytest.mark.asyncio
async def test_v13_triggers_prevent_accepted_quote_and_locked_item_mutation():
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "supabase"))
    fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "fixtures"))
    schema_v12_file = os.path.join(fixtures_dir, "schema_v12_snapshot.sql")
    v13_file = os.path.join(supabase_dir, "update_v13_order_lifecycle_canonicalization.sql")
    
    db_trg = "pettravel_v13_triggers_test"
    await create_isolated_database(db_trg)
    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_trg
    )
    try:
        await run_sql_file(conn, schema_v12_file)
        await run_sql_file(conn, v13_file)
        
        # Seed test data
        await conn.execute("INSERT INTO organizations (id, name) VALUES ('org_trg', 'Trg Org');")
        await conn.execute("INSERT INTO suppliers (id, code, name) VALUES ('sup_1', 'SUP-1', 'Supplier 1');")
        await conn.execute("""
            INSERT INTO app_users (id, organization_id, full_name, email, status)
            VALUES ('user_trg', 'org_trg', 'User T', 'trg@example.com', 'active');
        """)
        await conn.execute("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
            VALUES ('ord_trg', 'PTW-TRG', 'org_trg', 'user_trg', 'customer_accepted', 'deposit_cod');
        """)
        await conn.execute("""
            INSERT INTO order_items 
            (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot,
             variant_label_snapshot, supplier_id, quantity, unit_price_snapshot, locked)
            VALUES ('oi_trg', 'ord_trg', 'P-T', 'Prod T', 'SKU-T', 'Label T', 'sup_1', 5, 100000, true);
        """)
        await conn.execute("""
            INSERT INTO quote_versions 
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            VALUES ('qv_trg', 'ord_trg', 1, 'accepted', 500000, 500000, 150000, 350000, NOW() + INTERVAL '3 days');
        """)
        
        # 1. Attempt to mutate accepted quote final_total -> MUST RAISE
        with pytest.raises(asyncpg.exceptions.PostgresError) as exc1:
            await conn.execute("UPDATE quote_versions SET final_total = 400000 WHERE id = 'qv_trg';")
        assert "ACCEPTED_QUOTE_IMMUTABLE" in str(exc1.value)
        
        # 2. Attempt to delete accepted quote -> MUST RAISE
        with pytest.raises(asyncpg.exceptions.PostgresError) as exc2:
            await conn.execute("DELETE FROM quote_versions WHERE id = 'qv_trg';")
        assert "ACCEPTED_QUOTE_IMMUTABLE" in str(exc2.value)
        
        # 3. Attempt to mutate locked order item quantity -> MUST RAISE
        with pytest.raises(asyncpg.exceptions.PostgresError) as exc3:
            await conn.execute("UPDATE order_items SET quantity = 10 WHERE id = 'oi_trg';")
        assert "LOCKED_ITEM_IMMUTABLE" in str(exc3.value)
        
        # 4. Attempt to delete locked order item -> MUST RAISE
        with pytest.raises(asyncpg.exceptions.PostgresError) as exc4:
            await conn.execute("DELETE FROM order_items WHERE id = 'oi_trg';")
        assert "LOCKED_ITEM_IMMUTABLE" in str(exc4.value)
    finally:
        await conn.close()

