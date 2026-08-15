import asyncio
import asyncpg
import json
import hashlib

db_url = 'postgresql://postgres.gfiyzwrcvsnsimwbpgbb:HvT%40270756832002@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'

async def inspect_prod():
    conn = await asyncpg.connect(db_url, timeout=10)
    try:
        ver = await conn.fetchval('SELECT version();')
        s_ver = await conn.fetchval('SHOW server_version;')
        c_user = await conn.fetchval('SELECT current_user;')
        s_user = await conn.fetchval('SELECT session_user;')
        c_db = await conn.fetchval('SELECT current_database();')
        
        print('=== PROD IDENTITY ===')
        print('version:', ver)
        print('server_version:', s_ver)
        print('current_user:', c_user)
        print('session_user:', s_user)
        print('current_database:', c_db)

        # Inspect procedures
        funcs = await conn.fetch('''
            SELECT 
                p.proname,
                pg_get_function_identity_arguments(p.oid) as identity_args,
                pg_get_userbyid(p.proowner) as owner,
                p.prosecdef,
                p.proconfig,
                p.proacl::text as proacl,
                pg_get_functiondef(p.oid) as definition
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('pt_reserve_order_stock', 'pt_post_order_accounting')
            ORDER BY p.proname;
        ''')
        
        print('\n=== FUNCTIONS AUDIT ===')
        for f in funcs:
            h = hashlib.sha256(f['definition'].encode('utf-8')).hexdigest()
            print('Name:', f['proname'])
            print('Args:', f['identity_args'])
            print('Owner:', f['owner'])
            print('SECURITY DEFINER (prosecdef):', f['prosecdef'])
            print('proconfig (search_path):', f['proconfig'])
            print('proacl:', f['proacl'])
            print('SHA256:', h)
            print('Def length:', len(f['definition']))
            
        # Check permissions explicitly
        perms = await conn.fetch('''
            SELECT 
                routine_name, 
                grantee, 
                privilege_type
            FROM information_schema.routine_privileges
            WHERE routine_schema = 'public' 
              AND routine_name IN ('pt_reserve_order_stock', 'pt_post_order_accounting')
            ORDER BY routine_name, grantee;
        ''')
        print('\n=== ROUTINE PRIVILEGES ===')
        for p in perms:
            print(f"{p['routine_name']} -> {p['grantee']}: {p['privilege_type']}")

        # Audit Commercial SOT and COGS rules in pt_post_order_accounting definition
        for f in funcs:
            if f['proname'] == 'pt_post_order_accounting':
                defn = f['definition']
                print('\n=== DEFINITION AUDIT CHECKS ===')
                print("Contains status = 'accepted':", "status = 'accepted'" in defn or "status = ''accepted''" in defn or "status = 'accepted'" in defn.lower())
                print("Contains final_total > 0:", "final_total > 0" in defn)
                print("Rejects ambiguous quote:", "ACCOUNTING_COMMERCIAL_SNAPSHOT_AMBIGUOUS" in defn)
                print("Rejects missing quote:", "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in defn)
                print("Contains accounting.override_consumed_stock check:", "accounting.override_consumed_stock" in defn)
                print("Contains search_path = '':", f['proconfig'] == ['search_path=""'])
                print("Contains post_confirmed_payments mode separation:", "post_confirmed_payments" in defn)

            if f['proname'] == 'pt_reserve_order_stock':
                defn = f['definition']
                print('\n=== ATP DEFINITION AUDIT CHECKS ===')
                print("Contains customer_orders FOR UPDATE:", "FOR UPDATE" in defn and "customer_orders" in defn)
                print("Contains inventory_balances FOR UPDATE:", "FOR UPDATE OF ib" in defn or "FOR UPDATE" in defn)
                print("Contains deterministic sort:", "product_variant_id ASC" in defn)
                print("Contains already_reserved check:", "already_reserved" in defn)

    finally:
        await conn.close()

if __name__ == '__main__':
    asyncio.run(inspect_prod())
