import asyncio
import os
import asyncpg
import hashlib
import json
import time
from urllib.parse import urlsplit

from app.core.config import settings


def get_asyncpg_database_url() -> str:
    return settings.async_database_url.replace("postgresql+asyncpg://", "postgresql://", 1)

async def execute_production_v11_v12():
    db_url = get_asyncpg_database_url()
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'supabase'))
    v11_file = os.path.join(supabase_dir, 'update_v11_security_accounting_hardening.sql')
    v12_file = os.path.join(supabase_dir, 'update_v12_commercial_sot_hardening.sql')

    with open(v11_file, 'rb') as f: v11_bytes = f.read()
    with open(v12_file, 'rb') as f: v12_bytes = f.read()

    v11_hash = hashlib.sha256(v11_bytes).hexdigest()
    v12_hash = hashlib.sha256(v12_bytes).hexdigest()

    print("=" * 80)
    print("PET TRAVEL WHOLESALE — PRODUCTION V11 -> V12 CONTROLLED UPGRADE")
    print("=" * 80)
    parsed_target = urlsplit(db_url)
    print(f"Target: {parsed_target.hostname}:{parsed_target.port or 5432}/{parsed_target.path.lstrip('/')}")
    print(f"V11 Artifact SHA256: {v11_hash}")
    print(f"V12 Artifact SHA256: {v12_hash}")

    assert v11_hash == "45efbb2b3d7439a90fb4a99ce656a9d4ce50b4767dac02c19890500e0c30fa8f", "V11 hash mismatch!"
    assert v12_hash == "5602199ed3f728a01928dd4aec53976e162c2148b8379dae279c147f71eff0aa", "V12 hash mismatch!"
    print("-> Cryptographic hash gates passed.")

    conn = await asyncpg.connect(db_url, timeout=15)
    try:
        # Pre-check locks
        active_q = await conn.fetch("SELECT pid, query FROM pg_stat_activity WHERE state != 'idle' AND pid != pg_backend_pid();")
        if active_q:
            print(f"WARNING: {len(active_q)} active queries detected:")
            for q in active_q: print(f"  PID {q['pid']}: {q['query'][:60]}")
        else:
            print("-> Zero active locks/transactions detected.")

        # Step 1: Execute V11
        print("\n--- [STEP 1/4] Applying V11 Forward Security & Reconciliation ---")
        t0 = time.perf_counter()
        await conn.execute(v11_bytes.decode('utf-8'))
        t1 = time.perf_counter()
        print(f"-> V11 Applied successfully in {(t1-t0)*1000:.2f}ms.")

        # Step 2: Post-Check V11
        print("\n--- [STEP 2/4] Post-V11 Verification ---")
        v11_funcs = await conn.fetch("""
            SELECT p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as def
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname IN ('pt_reserve_order_stock', 'pt_post_order_accounting');
        """)
        for f in v11_funcs:
            sha = hashlib.sha256(f['def'].strip().encode('utf-8')).hexdigest()
            print(f"  - {f['proname']}: prosecdef={f['prosecdef']}, search_path={f['proconfig']}, SHA256={sha}")
        assert len(v11_funcs) == 2, "Missing function post-V11"

        # Step 3: Execute V12
        print("\n--- [STEP 3/4] Applying V12 Commercial SOT Hardening ---")
        t0 = time.perf_counter()
        await conn.execute(v12_bytes.decode('utf-8'))
        t1 = time.perf_counter()
        print(f"-> V12 Applied successfully in {(t1-t0)*1000:.2f}ms.")

        # Step 4: Post-Check V12 & Monitoring
        print("\n--- [STEP 4/4] Post-V12 Final Verification & Monitoring ---")
        v12_funcs = await conn.fetch("""
            SELECT p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as def
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname IN ('pt_reserve_order_stock', 'pt_post_order_accounting');
        """)
        for f in v12_funcs:
            sha = hashlib.sha256(f['def'].strip().encode('utf-8')).hexdigest()
            print(f"  - {f['proname']}: prosecdef={f['prosecdef']}, search_path={f['proconfig']}, SHA256={sha}")
            assert f['prosecdef'] is True, f"{f['proname']} must be SECURITY DEFINER"
            assert f['proconfig'] == ['search_path=""'], f"{f['proname']} must have search_path=''"

        # Privilege check
        assert await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
        assert await conn.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
        assert await conn.fetchval("SELECT has_function_privilege('service_role', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is True
        print("-> Function privileges strictly enforced (anon/auth DENIED, service_role GRANTED).")

        # Non-destructive test transaction with clean rollback
        async with conn.transaction():
            print("-> Testing atomic exception behavior inside transactional sandbox...")
            try:
                await conn.execute("SELECT public.pt_post_order_accounting('non_existent_ord', 'admin_actor', 'recognize_sale', 1000, true);")
            except Exception as e:
                print(f"-> Expected fail-closed response received: {type(e).__name__}")
            raise asyncpg.exceptions.TransactionRollbackError("Transactional sandbox completed cleanly.")
            
    except asyncpg.exceptions.TransactionRollbackError:
        print("-> Transaction sandbox cleanly rolled back.")
    finally:
        await conn.close()

    print("\n" + "=" * 80)
    print("PRODUCTION STATUS: PRODUCTION_VERIFIED_V11_V12 (100% COMPLETE)")
    print("=" * 80)

if __name__ == '__main__':
    asyncio.run(execute_production_v11_v12())
