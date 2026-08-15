import asyncio
import os
import asyncpg
import json
import hashlib

POSTGRES_TEST_HOST = "localhost"
POSTGRES_TEST_PORT = 5439
POSTGRES_TEST_USER = "postgres"
POSTGRES_TEST_PASS = "postgres"

async def run_staging_drill():
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'supabase'))
    v11_file = os.path.join(supabase_dir, 'update_v11_security_accounting_hardening.sql')
    rollback_file = os.path.join(supabase_dir, 'rollback_v11_forward_repair.sql')
    schema_file = os.path.join(supabase_dir, 'schema.sql')

    with open(v11_file, 'rb') as f:
        v11_bytes = f.read()
    with open(rollback_file, 'rb') as f:
        rb_bytes = f.read()

    v11_hash = hashlib.sha256(v11_bytes).hexdigest()
    rb_hash = hashlib.sha256(rb_bytes).hexdigest()

    print(f"[STAGING DRILL] Migration SHA256: {v11_hash} ({len(v11_bytes)} bytes)")
    print(f"[STAGING DRILL] Rollback SHA256:  {rb_hash} ({len(rb_bytes)} bytes)")

    db_name = "pettravel_staging_drill"
    conn = await asyncpg.connect(user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS, host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database="postgres")
    await conn.execute(f"DROP DATABASE IF EXISTS {db_name};")
    await conn.execute(f"CREATE DATABASE {db_name};")
    await conn.close()

    conn = await asyncpg.connect(user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS, host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database=db_name)

    historical_files = [
        os.path.join(supabase_dir, f) for f in [
            'update_schema.sql', 'update_v2.sql', 'update_v3_accounting.sql',
            'update_v4_operations.sql', 'update_v5_receivables_reconciliation.sql',
            'update_v6_stock_reservations.sql', 'update_v7_accounting_order_posting.sql',
            'update_v7_variant_images.sql', 'update_v8_drop_exec_sql.sql',
            'update_v9_order_workflow_guards.sql'
        ]
    ]

    with open(schema_file, 'r', encoding='utf-8') as f:
        await conn.execute(f.read())
    for hf in historical_files:
        if os.path.exists(hf):
            with open(hf, 'r', encoding='utf-8') as f:
                await conn.execute(f.read())

    # Create staging dedicated role
    await conn.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend_staging') THEN
                CREATE ROLE pettravel_backend_staging NOLOGIN;
            END IF;
        END $$;
        GRANT USAGE ON SCHEMA public TO pettravel_backend_staging;
    """)

    print("Phase 1: Bootstrap Staging Environment -> SUCCESS")

    # Phase 2: Staging Exact Migration
    await conn.execute(v11_bytes.decode('utf-8'))
    print("Phase 2: Exact V11 Applied to Staging -> SUCCESS")

    # Assert V11 security
    assert await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
    assert await conn.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
    assert await conn.fetchval("SELECT has_function_privilege('pettravel_backend_staging', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is True
    print("Phase 3: Staging V11 Security Validated -> SUCCESS")

    # Phase 4: Staging Rollback Drill
    await conn.execute(rb_bytes.decode('utf-8'))
    print("Phase 4: Exact Rollback Applied to Staging -> SUCCESS")

    # Assert Rollback security
    assert await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
    assert await conn.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
    assert await conn.fetchval("SELECT has_function_privilege('pettravel_backend_staging', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is True
    print("Phase 5: Staging Rollback Security Validated -> SUCCESS")

    # Phase 6: Staging V11 Reapply
    await conn.execute(v11_bytes.decode('utf-8'))
    print("Phase 6: Exact V11 Reapplied to Staging -> SUCCESS")

    # Assert Reapply security
    assert await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
    assert await conn.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
    assert await conn.fetchval("SELECT has_function_privilege('pettravel_backend_staging', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is True
    print("Phase 7: Staging V11 Reapply Security Validated -> SUCCESS")

    await conn.close()
    print("[STAGING DRILL] COMPLETED 100% CLEANLY")

if __name__ == '__main__':
    asyncio.run(run_staging_drill())
