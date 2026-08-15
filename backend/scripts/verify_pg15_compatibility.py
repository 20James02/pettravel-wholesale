import asyncio
import os
import asyncpg
import json

async def run_pg15_verification():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5440/postgres')
    v = await conn.fetchval('SELECT version();')
    print('Connected to PG15 container:', v)
    
    await conn.execute('DROP DATABASE IF EXISTS pettravel_pg15_test;')
    await conn.execute('CREATE DATABASE pettravel_pg15_test;')
    await conn.close()

    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5440/pettravel_pg15_test')
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'supabase'))
    schema_file = os.path.join(supabase_dir, 'schema.sql')
    v11_file = os.path.join(supabase_dir, 'update_v11_security_accounting_hardening.sql')
    rollback_file = os.path.join(supabase_dir, 'rollback_v11_forward_repair.sql')

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

    print('Step 1: Bootstrap baseline + historical migrations on PG15 -> SUCCESS')

    # Step 2: Apply Exact V11 Migration
    with open(v11_file, 'r', encoding='utf-8') as f:
        await conn.execute(f.read())
    print('Step 2: Apply Exact V11 Migration on PG15 -> SUCCESS')

    # Check V11 functions & security
    def_reserve = await conn.fetchval("SELECT pg_get_functiondef('pt_reserve_order_stock(text,text,timestamptz)'::regprocedure)")
    def_acct = await conn.fetchval("SELECT pg_get_functiondef('pt_post_order_accounting(text,text,text,integer,boolean)'::regprocedure)")
    assert def_reserve is not None and def_acct is not None
    assert await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
    assert await conn.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
    assert await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_post_order_accounting(text,text,text,integer,boolean)', 'EXECUTE')") is False
    assert await conn.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_post_order_accounting(text,text,text,integer,boolean)', 'EXECUTE')") is False
    print('Step 3: Verify V11 Security on PG15 -> SUCCESS')

    # Step 4: Apply Exact Rollback
    with open(rollback_file, 'r', encoding='utf-8') as f:
        await conn.execute(f.read())
    print('Step 4: Apply Exact Rollback on PG15 -> SUCCESS')

    assert await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
    assert await conn.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
    print('Step 5: Verify Rollback Security Invariant on PG15 -> SUCCESS')

    # Step 6: Reapply Exact V11
    with open(v11_file, 'r', encoding='utf-8') as f:
        await conn.execute(f.read())
    print('Step 6: Reapply Exact V11 on PG15 -> SUCCESS')

    await conn.close()
    print('ALL PG15 TESTS PASSED WITH 100% SUCCESS!')

if __name__ == '__main__':
    asyncio.run(run_pg15_verification())
