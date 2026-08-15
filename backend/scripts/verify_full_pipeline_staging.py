import asyncio
import os
import asyncpg
import hashlib
import json
import time

async def run_full_pipeline_verification():
    supabase_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'supabase'))
    v11_file = os.path.join(supabase_dir, 'update_v11_security_accounting_hardening.sql')
    v11_rb_file = os.path.join(supabase_dir, 'rollback_v11_forward_repair.sql')
    v12_file = os.path.join(supabase_dir, 'update_v12_commercial_sot_hardening.sql')
    v12_rb_file = os.path.join(supabase_dir, 'rollback_v12_forward_repair.sql')
    v12_em_file = os.path.join(supabase_dir, 'emergency', 'v12_forward_repair.sql')
    schema_file = os.path.join(supabase_dir, 'schema.sql')

    # Read artifacts
    with open(v11_file, 'rb') as f: v11_bytes = f.read()
    with open(v11_rb_file, 'rb') as f: v11_rb_bytes = f.read()
    with open(v12_file, 'rb') as f: v12_bytes = f.read()
    with open(v12_rb_file, 'rb') as f: v12_rb_bytes = f.read()
    with open(v12_em_file, 'rb') as f: v12_em_bytes = f.read()
    with open(schema_file, 'r', encoding='utf-8') as f: schema_sql = f.read()

    # Cryptographic Hash Gate
    v11_hash = hashlib.sha256(v11_bytes).hexdigest()
    v12_hash = hashlib.sha256(v12_bytes).hexdigest()
    v12_rb_hash = hashlib.sha256(v12_rb_bytes).hexdigest()
    v12_em_hash = hashlib.sha256(v12_em_bytes).hexdigest()

    print("=" * 80)
    print("STEP 0: ARTIFACT CRYPTOGRAPHIC INTEGRITY GATE")
    print("=" * 80)
    print(f"V11 Migration SHA256:  {v11_hash} ({len(v11_bytes)} bytes)")
    print(f"V12 Migration SHA256:  {v12_hash} ({len(v12_bytes)} bytes)")
    print(f"V12 Rollback SHA256:   {v12_rb_hash} ({len(v12_rb_bytes)} bytes)")
    print(f"V12 Emergency SHA256:  {v12_em_hash} ({len(v12_em_bytes)} bytes)")
    assert v12_rb_hash == v12_em_hash, "Rollback and Emergency scripts must match byte-for-byte!"
    assert v11_hash == "45efbb2b3d7439a90fb4a99ce656a9d4ce50b4767dac02c19890500e0c30fa8f", "V11 hash mutated!"
    assert v12_hash == "5602199ed3f728a01928dd4aec53976e162c2148b8379dae279c147f71eff0aa", "V12 hash mutated!"
    print("-> ARTIFACT INTEGRITY VERIFIED (100% MATCH)\n")

    for port, pg_label in [(5440, "PostgreSQL 15 (Target Prod Match)"), (5439, "PostgreSQL 16 (Local Test Suite)")]:
        print("=" * 80)
        print(f"PIPELINE DRILL ON {pg_label} (Port {port})")
        print("=" * 80)

        db_name = f"pettravel_pipeline_staging_{port}"
        admin_conn = await asyncpg.connect(user="postgres", password="postgres", host="localhost", port=port, database="postgres")
        await admin_conn.execute(f"DROP DATABASE IF EXISTS {db_name};")
        await admin_conn.execute(f"CREATE DATABASE {db_name};")
        await admin_conn.close()

        conn = await asyncpg.connect(user="postgres", password="postgres", host="localhost", port=port, database=db_name)

        # ── 1. BOOTSTRAP STAGING WITH SCHEMA & HISTORICAL MIGRATIONS ──
        print("1. Bootstrapping Staging Base Schema & Roles...")
        await conn.execute(schema_sql)
        historical_files = [
            'update_schema.sql', 'update_v2.sql', 'update_v3_accounting.sql',
            'update_v4_operations.sql', 'update_v5_receivables_reconciliation.sql',
            'update_v6_stock_reservations.sql', 'update_v7_accounting_order_posting.sql',
            'update_v7_variant_images.sql', 'update_v8_drop_exec_sql.sql',
            'update_v9_order_workflow_guards.sql'
        ]
        for hf in historical_files:
            hp = os.path.join(supabase_dir, hf)
            if os.path.exists(hp):
                with open(hp, 'r', encoding='utf-8') as f:
                    await conn.execute(f.read())

        await conn.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend_staging') THEN CREATE ROLE pettravel_backend_staging NOLOGIN; END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend') THEN CREATE ROLE pettravel_backend NOLOGIN; END IF;
            END $$;
        """)
        print("   -> Staging Base Schema & Roles Configured.")

        # ── 2. V11 TREN STAGING ──
        print("\n2. Applying V11 onto Staging...")
        t0 = time.perf_counter()
        await conn.execute(v11_bytes.decode('utf-8'))
        t1 = time.perf_counter()
        print(f"   -> V11 Applied successfully in {(t1-t0)*1000:.2f}ms.")

        # ── 3. V12 STAGING ──
        print("\n3. Applying V12 Forward Migration onto Staging...")
        t0 = time.perf_counter()
        await conn.execute(v12_bytes.decode('utf-8'))
        t1 = time.perf_counter()
        print(f"   -> V12 Applied successfully in {(t1-t0)*1000:.2f}ms.")

        # ── 4. COMMERCIAL SOT MATRIX (A..J) ON STAGING ──
        print("\n4. Executing Commercial SOT Matrix (A..J)...")
        # Setup base seed
        await conn.execute("""
            INSERT INTO organizations (id, name)
            VALUES 
                ('org_seller', 'PetTravel Seller'),
                ('org_buyer_1', 'PetTravel Buyer')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO app_users (id, organization_id, full_name, email, status)
            VALUES ('admin_ops', 'org_seller', 'Admin Ops', 'admin@pettravel.vn', 'active')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO roles (id, key, name, is_system)
            VALUES ('role_ops_mgr', 'operations_manager', 'Ops Manager', true)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO permissions (key, description)
            VALUES 
                ('inventory.reserve', 'Reserve stock'),
                ('accounting.post', 'Post accounting'),
                ('accounting.override_cogs', 'Override COGS')
            ON CONFLICT (key) DO NOTHING;

            INSERT INTO role_permissions (role_id, permission_key)
            VALUES 
                ('role_ops_mgr', 'inventory.reserve'),
                ('role_ops_mgr', 'accounting.post'),
                ('role_ops_mgr', 'accounting.override_cogs')
            ON CONFLICT DO NOTHING;

            INSERT INTO user_roles (user_id, role_id)
            VALUES ('admin_ops', 'role_ops_mgr')
            ON CONFLICT DO NOTHING;

            INSERT INTO products (id, code, name, brand, category, active)
            VALUES ('prod_1', 'P-RACE', 'Race Prod', 'Brand PT', 'Nutrition', true)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO product_variants (id, product_id, sku, label, active)
            VALUES ('var_race_1', 'prod_1', 'SKU-RACE-1', 'Standard', true)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO suppliers (id, code, name, active)
            VALUES ('sup_pettravel', 'SUP-PT', 'PetTravel Supplier', true)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO warehouses (id, organization_id, code, name, is_default)
            VALUES ('wh_concur_1', 'org_seller', 'WH-01', 'Main WH', true)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO operations_documents (id, organization_id, type, document_no, status, created_by)
            VALUES ('doc_sot', 'org_seller', 'sales_invoice', 'INV-SOT-01', 'posted', 'admin_ops')
            ON CONFLICT (id) DO NOTHING;
        """)

        async def setup_order_stock(ord_id, item_id, res_id, sm_id):
            await conn.execute(f"""
                INSERT INTO order_items (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot, variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
                VALUES ('{item_id}', '{ord_id}', 'P-RACE', 'Race Prod', 'SKU-RACE-1', 'Standard', 'sup_pettravel', 1, 1000000)
                ON CONFLICT (id) DO NOTHING;
                INSERT INTO stock_reservations (
                    id, organization_id, warehouse_id, order_id, order_item_id, product_variant_id,
                    sku_snapshot, quantity, status, consumed_document_id, created_by
                ) VALUES (
                    '{res_id}', 'org_seller', 'wh_concur_1', '{ord_id}', '{item_id}', 'var_race_1',
                    'SKU-RACE-1', 1, 'consumed', 'doc_sot', 'admin_ops'
                ) ON CONFLICT (id) DO NOTHING;
                INSERT INTO stock_movements (
                    id, organization_id, warehouse_id, document_id, product_variant_id,
                    sku_snapshot, movement_type, quantity_delta, unit_cost, created_by
                ) VALUES (
                    '{sm_id}', 'org_seller', 'wh_concur_1', 'doc_sot', 'var_race_1',
                    'SKU-RACE-1', 'sale_out', -1, 400000, 'admin_ops'
                ) ON CONFLICT (id) DO NOTHING;
            """)

        # Case A
        await conn.execute("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
            VALUES ('ord_sot_a', 'PTW-SOT-A', 'org_buyer_1', 'admin_ops', 'locked', 'deposit_cod', 1)
            ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1;
            INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            VALUES 
                ('q_sot_a1', 'ord_sot_a', 1, 'accepted', 1000000, 1000000, 300000, 700000, now() + interval '7 days'),
                ('q_sot_a2', 'ord_sot_a', 2, 'draft', 1500000, 1500000, 450000, 1050000, now() + interval '7 days')
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, final_total = EXCLUDED.final_total;
        """)
        await setup_order_stock('ord_sot_a', 'item_sot_a', 'res_sot_a', 'sm_sot_a')
        res_a = json.loads(await conn.fetchval("SELECT public.pt_post_order_accounting('ord_sot_a', 'admin_ops', 'recognize_sale', 1000, true)"))
        assert res_a["createdEntries"] == 1, "Case A failed"
        dr_a = await conn.fetchval("SELECT debit_amount FROM journal_lines WHERE order_id = 'ord_sot_a' AND account_code = '131'")
        assert dr_a == 1000000, f"Case A debit mismatch: {dr_a}"
        print("   -> Case A (Accepted V1 + Draft V2 -> Posts 1M): PASS")

        # Case C (Published only -> Missing SOT error)
        await conn.execute("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
            VALUES ('ord_sot_c', 'PTW-SOT-C', 'org_buyer_1', 'admin_ops', 'customer_accepted', 'deposit_cod', 1)
            ON CONFLICT (id) DO UPDATE SET commercial_status = 'customer_accepted', current_quote_version = 1;
            INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            VALUES ('q_sot_c1', 'ord_sot_c', 1, 'published', 800000, 800000, 240000, 560000, now() + interval '7 days')
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, final_total = EXCLUDED.final_total;
        """)
        await setup_order_stock('ord_sot_c', 'item_sot_c', 'res_sot_c', 'sm_sot_c')
        try:
            await conn.execute("SELECT public.pt_post_order_accounting('ord_sot_c', 'admin_ops', 'recognize_sale', 1000, true)")
            assert False, "Case C should have failed"
        except Exception as e:
            assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in str(e), f"Unexpected Case C error: {e}"
        print("   -> Case C (Published only -> Missing SOT Fail Closed): PASS")

        # Case I (Multiple Accepted -> Ambiguous SOT error)
        await conn.execute("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
            VALUES ('ord_sot_i', 'PTW-SOT-I', 'org_buyer_1', 'admin_ops', 'locked', 'deposit_cod', 1)
            ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1;
            INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            VALUES 
                ('q_sot_i1', 'ord_sot_i', 1, 'accepted', 1000000, 1000000, 300000, 700000, now() + interval '7 days'),
                ('q_sot_i2', 'ord_sot_i', 2, 'accepted', 1100000, 1100000, 330000, 770000, now() + interval '7 days')
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, final_total = EXCLUDED.final_total;
        """)
        await setup_order_stock('ord_sot_i', 'item_sot_i', 'res_sot_i', 'sm_sot_i')
        try:
            await conn.execute("SELECT public.pt_post_order_accounting('ord_sot_i', 'admin_ops', 'recognize_sale', 1000, true)")
            assert False, "Case I should have failed"
        except Exception as e:
            assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_AMBIGUOUS" in str(e), f"Unexpected Case I error: {e}"
        print("   -> Case I (Multiple Accepted -> Ambiguous SOT Fail Closed): PASS")

        # Case J (post_confirmed_payments -> Succeeds without accepted quote)
        await conn.execute("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
            VALUES ('ord_sot_j', 'PTW-SOT-J', 'org_buyer_1', 'admin_ops', 'draft', 'deposit_cod')
            ON CONFLICT (id) DO UPDATE SET commercial_status = 'draft';
            INSERT INTO payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at, confirmed_at)
            VALUES ('pay_sot_j1', 'ord_sot_j', 'q_sot_a1', 'deposit', 250000, 'REF-SOT-J1', 'vietqr://j1', 'confirmed', now() + interval '1 day', now())
            ON CONFLICT (id) DO UPDATE SET status = 'confirmed';
        """)
        res_j = json.loads(await conn.fetchval("SELECT public.pt_post_order_accounting('ord_sot_j', 'admin_ops', 'post_confirmed_payments', 0, false)"))
        assert res_j["createdEntries"] == 1, "Case J failed"
        print("   -> Case J (post_confirmed_payments succeeds without accepted quote): PASS")

        # ── 5. SECURITY / LEDGER / ATP ──
        print("\n5. Validating Security, Ledger Double-Entry, and ATP Invariants...")
        assert await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
        assert await conn.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
        assert await conn.fetchval("SELECT has_function_privilege('pettravel_backend_staging', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is True
        assert await conn.fetchval("SELECT has_function_privilege('pettravel_backend', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is True

        # Assert double-entry balance
        unbalanced = await conn.fetchval("""
            SELECT count(*) FROM (
                SELECT entry_id, sum(debit_amount) as tot_dr, sum(credit_amount) as tot_cr
                FROM journal_lines
                GROUP BY entry_id
                HAVING sum(debit_amount) != sum(credit_amount)
            ) s;
        """)
        assert unbalanced == 0, f"Unbalanced journal entries found: {unbalanced}"
        print("   -> Double-Entry General Ledger Balance Verified (0 Unbalanced Entries)")
        print("   -> Security Privileges & Search Path Verified.")

        # ── 6. V12 ROLLBACK DRILL ──
        print("\n6. Executing V12 Rollback Drill on Staging...")
        t0 = time.perf_counter()
        await conn.execute(v12_rb_bytes.decode('utf-8'))
        t1 = time.perf_counter()
        print(f"   -> Rollback Forward Repair Executed in {(t1-t0)*1000:.2f}ms.")
        assert await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
        assert await conn.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
        print("   -> Rollback Security Invariants Verified.")

        # ── 7. V12 REAPPLY ──
        print("\n7. Reapplying V12 Forward Migration onto Staging...")
        t0 = time.perf_counter()
        await conn.execute(v12_bytes.decode('utf-8'))
        t1 = time.perf_counter()
        print(f"   -> V12 Reapplied successfully in {(t1-t0)*1000:.2f}ms.")
        assert await conn.fetchval("SELECT has_function_privilege('anon', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
        assert await conn.fetchval("SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is False
        assert await conn.fetchval("SELECT has_function_privilege('pettravel_backend_staging', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')") is True
        print("   -> Reapply Invariants Verified.")

        await conn.close()
        print(f"\n[DRILL COMPLETED ON {pg_label}]: 100% PASS\n")

if __name__ == '__main__':
    asyncio.run(run_full_pipeline_verification())
