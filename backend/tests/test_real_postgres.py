"""
Real PostgreSQL Integration & Concurrency Test Suite for Pet Travel Wholesale.
Target: PostgreSQL 16+ on port 5439 (pettravel_test_pg container / WSL PostgreSQL 18).
"""

import asyncio
import glob
import os
import re
import sys
from typing import Any

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg
import psycopg2
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.repositories.catalog import list_products

POSTGRES_TEST_HOST = os.getenv("POSTGRES_TEST_HOST", "127.0.0.1")
POSTGRES_TEST_PORT = int(os.getenv("POSTGRES_TEST_PORT", "5439"))
POSTGRES_TEST_USER = os.getenv("POSTGRES_TEST_USER", "postgres")
POSTGRES_TEST_PASS = os.getenv("POSTGRES_TEST_PASS", "postgres")

POSTGRES_TEST_URL = f"postgresql+asyncpg://{POSTGRES_TEST_USER}:{POSTGRES_TEST_PASS}@{POSTGRES_TEST_HOST}:{POSTGRES_TEST_PORT}/pettravel_test"
SYNC_POSTGRES_URL = f"postgresql://{POSTGRES_TEST_USER}:{POSTGRES_TEST_PASS}@{POSTGRES_TEST_HOST}:{POSTGRES_TEST_PORT}/pettravel_test"


# ── FIXTURES & SETUP ──────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def setup_postgres_schema():
    """Synchronously bootstrap schema.sql and all update_*.sql migrations once per session."""
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    supabase_dir = os.path.join(root_dir, "supabase")
    
    conn = psycopg2.connect(SYNC_POSTGRES_URL)
    cur = conn.cursor()
    
    # 1. Clean public schema
    cur.execute("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
    conn.commit()
    
    # 2. Apply baseline schema.sql
    schema_path = os.path.join(supabase_dir, "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as f:
        cur.execute(f.read())
    conn.commit()
    
    # 3. Apply all sequential update migrations with natural numeric sorting (v1..v13)
    def migration_sort_key(path: str):
        fname = os.path.basename(path)
        nums = re.findall(r'\d+', fname)
        return (int(nums[0]) if nums else 0, fname)

    migration_files = sorted(glob.glob(os.path.join(supabase_dir, "update_*.sql")), key=migration_sort_key)
    for update_file in migration_files:
        with open(update_file, "r", encoding="utf-8") as f:
            cur.execute(f.read())
        conn.commit()
        
    # 4. Seed core baseline entities
    cur.execute("""
        INSERT INTO organizations (id, name) VALUES 
        ('org_seller', 'Pet Travel Corp'),
        ('org_buyer_1', 'Dai Ly 1'),
        ('org_buyer_2', 'Dai Ly 2'),
        ('org_buyer_snap', 'Dai Ly Snap'),
        ('org_buyer_pay', 'Dai Ly Pay'),
        ('org_buyer_acct', 'Dai Ly Acct'),
        ('org_buyer_inv', 'Dai Ly Inv'),
        ('org_buyer_multi_1', 'Dai Ly Multi 1'),
        ('org_buyer_multi_2', 'Dai Ly Multi 2'),
        ('org_buyer_same_race', 'Dai Ly Same Race'),
        ('org_buyer_acct_concur', 'Dai Ly Acct Concur'),
        ('org_buyer_cogs_null', 'Dai Ly Cogs Null'),
        ('org_buyer_no_cogs', 'Dai Ly No Cogs'),
        ('org_buyer_cross', 'Dai Ly Cross'),
        ('org_buyer_sot_a', 'Dai Ly SOT A'),
        ('org_buyer_sot_b', 'Dai Ly SOT B'),
        ('org_buyer_sot_c', 'Dai Ly SOT C'),
        ('org_buyer_sot_d', 'Dai Ly SOT D'),
        ('org_buyer_sot_e', 'Dai Ly SOT E'),
        ('org_buyer_sot_f', 'Dai Ly SOT F'),
        ('org_buyer_sot_g', 'Dai Ly SOT G'),
        ('org_buyer_sot_h', 'Dai Ly SOT H'),
        ('org_buyer_sot_i', 'Dai Ly SOT I'),
        ('org_buyer_sot_j', 'Dai Ly SOT J'),
        ('org_buyer_tie', 'Dai Ly Tie'),
        ('org_buyer_race_q', 'Dai Ly Race Q')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO warehouses (id, organization_id, code, name, is_default) VALUES 
        ('wh_concur_1', 'org_seller', 'WH-CONCUR-1', 'Warehouse 1', true),
        ('wh_tie_a', 'org_seller', 'WH-TIE-A', 'Warehouse Tie A', false),
        ('wh_tie_b', 'org_seller', 'WH-TIE-B', 'Warehouse Tie B', false)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO permissions (key, description) VALUES
            ('accounting.override_consumed_stock', 'Override consumed stock check on sale recognition')
        ON CONFLICT (key) DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_key)
        SELECT id, 'accounting.override_consumed_stock' FROM roles WHERE key = 'super_admin'
        ON CONFLICT DO NOTHING;

        INSERT INTO app_users (id, organization_id, full_name, email, status)
        VALUES ('admin_ops', 'org_seller', 'Ops Manager', 'ops@pettravel.vn', 'active')
        ON CONFLICT (id) DO UPDATE SET organization_id = 'org_seller';

        INSERT INTO suppliers (id, code, name, lead_time_days, admin_only, active)
        VALUES ('sup_pettravel', 'SUP-PET', 'Pet Travel Official', 1, false, true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO user_roles (user_id, role_id)
        SELECT 'admin_ops', id FROM roles WHERE key = 'super_admin'
        ON CONFLICT DO NOTHING;

        INSERT INTO products (id, code, name, brand, category, description, active)
        VALUES ('p_rc_cat', 'RC-CAT-01', 'Royal Canin Fit 32', 'Royal Canin', 'Thức ăn', 'Thức ăn hạt mèo', true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO product_variants (id, product_id, sku, label, barcode, active)
        VALUES 
            ('var_race_1', 'p_rc_cat', 'SKU-RACE-1', 'Bao Race 1', '893000000000', true),
            ('v_rc_2kg', 'p_rc_cat', 'SKU-RC-FIT-2KG', 'Bao 2kg', '893000000001', true),
            ('v_rc_4kg', 'p_rc_cat', 'SKU-RC-FIT-4KG', 'Bao 4kg', '893000000002', true),
            ('var_m_1', 'p_rc_cat', 'SKU-AAA-1', 'AAA Label', '893000000003', true),
            ('var_m_2', 'p_rc_cat', 'SKU-ZZZ-2', 'ZZZ Label', '893000000004', true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO supplier_offers (
            id, supplier_id, product_variant_id, wholesale_price,
            min_order_qty, stock_qty, lead_time_days, active
        ) VALUES 
            ('so_rc_2kg', 'sup_pettravel', 'v_rc_2kg', 240000, 5, 50, 2, true),
            ('so_rc_4kg', 'sup_pettravel', 'v_rc_4kg', 460000, 2, 20, 2, true),
            ('so_race_1', 'sup_pettravel', 'var_race_1', 150000, 1, 100, 1, true)
        ON CONFLICT (id) DO NOTHING;
    """)
    conn.commit()
    conn.close()


@pytest_asyncio.fixture
async def pg_engine():
    engine = create_async_engine(POSTGRES_TEST_URL, echo=False, pool_size=10, max_overflow=20, pool_pre_ping=True)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def pg_session(pg_engine):
    async_session = sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session


# ── HELPER UTILITIES ──────────────────────────────────────────────

def assert_no_forbidden_keys(obj: Any, forbidden_keys: set, path: str = "root"):
    if isinstance(obj, dict):
        for k, v in obj.items():
            assert k not in forbidden_keys, f"Found forbidden sensitive key '{k}' at path '{path}.{k}'"
            assert_no_forbidden_keys(v, forbidden_keys, f"{path}.{k}")
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            assert_no_forbidden_keys(item, forbidden_keys, f"{path}[{idx}]")


# ── TEST 1: CATALOG DATA PATH & GUEST SECURITY BOUNDARY (V-001, V-002) ──

@pytest.mark.asyncio
async def test_postgres_catalog_pipeline_and_guest_privacy_guards(pg_session: AsyncSession):
    guest_products = await list_products(pg_session, role="guest")
    assert len(guest_products) > 0, "Catalog should return active products"

    found = next((p for p in guest_products if p["id"] == "p_rc_cat"), None)
    assert found is not None, "p_rc_cat must exist in catalog output"

    FORBIDDEN_GUEST_KEYS = {
        "wholesalePrice", "wholesale_price",
        "supplierOffers", "supplier_offers",
        "supplier_id", "supplierId",
        "avg_cost_vnd", "stock_qty", "reserved_qty"
    }
    assert_no_forbidden_keys(guest_products, FORBIDDEN_GUEST_KEYS)


# ── TEST 2: AUTHENTICATED BUYER CAN SEE WHOLESALE PRICES (V-002) ───

@pytest.mark.asyncio
async def test_postgres_authenticated_buyer_sees_pricing(pg_session: AsyncSession):
    buyer_products = await list_products(pg_session, role="customer")
    found = next((p for p in buyer_products if p["id"] == "p_rc_cat"), None)
    assert found is not None
    assert len(found["variants"]) >= 2
    assert "wholesalePrice" in found["variants"][0], "Authenticated buyer MUST see wholesalePrice"


# ── TEST 3: ATP TWO-BUYER CONCURRENT RACE CONDITION (V-003) ────────

@pytest.mark.asyncio
async def test_postgres_atp_concurrent_locking_single_stock(pg_engine):
    async_session = sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        await session.execute(text("""
            INSERT INTO inventory_balances (
                id, organization_id, warehouse_id, product_variant_id, sku, supplier_id,
                on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd, updated_at
            ) VALUES (
                'bal_race_1', 'org_seller', 'wh_concur_1', 'var_race_1', 'SKU-RACE-1', 'sup_pettravel',
                1, 0, 0, 100000, now()
            ) ON CONFLICT (id) DO UPDATE SET on_hand_qty = 1, reserved_qty = 0, defective_qty = 0
        """))
        await session.execute(text("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
            VALUES 
                ('ord_race_a', 'PTW-RACE-A', 'org_buyer_1', 'admin_ops', 'customer_accepted', 'deposit_cod'),
                ('ord_race_b', 'PTW-RACE-B', 'org_buyer_2', 'admin_ops', 'customer_accepted', 'deposit_cod')
            ON CONFLICT (id) DO UPDATE SET commercial_status = 'customer_accepted'
        """))
        await session.execute(text("""
            INSERT INTO order_items (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot, variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
            VALUES 
                ('item_race_a', 'ord_race_a', 'P-RACE', 'Race Prod', 'SKU-RACE-1', 'Standard', 'sup_pettravel', 1, 150000),
                ('item_race_b', 'ord_race_b', 'P-RACE', 'Race Prod', 'SKU-RACE-1', 'Standard', 'sup_pettravel', 1, 150000)
            ON CONFLICT (id) DO NOTHING
        """))
        await session.execute(text("DELETE FROM stock_reservations WHERE order_id IN ('ord_race_a', 'ord_race_b')"))
        await session.commit()

    async def try_reserve(order_id: str):
        async with async_session() as s:
            try:
                res = await s.execute(
                    text("SELECT public.pt_reserve_order_stock(:order_id, :actor_id) as outcome"),
                    {"order_id": order_id, "actor_id": "admin_ops"}
                )
                await s.commit()
                return {"success": True, "result": res.scalar_one(), "order_id": order_id}
            except Exception as e:
                await s.rollback()
                return {"success": False, "error": str(e), "order_id": order_id}

    results = await asyncio.gather(
        try_reserve("ord_race_a"),
        try_reserve("ord_race_b")
    )

    successes = [r for r in results if r["success"]]
    failures = [r for r in results if not r["success"]]

    assert len(successes) == 1, f"Expected exactly 1 order to win the unit, got {len(successes)}: {results}"
    assert len(failures) == 1, f"Expected exactly 1 order to fail due to stock depletion, got {len(failures)}"
    assert "Available stock is not enough" in failures[0]["error"]

    async with async_session() as session:
        bal = (await session.execute(text("SELECT on_hand_qty, reserved_qty FROM inventory_balances WHERE id = 'bal_race_1'"))).fetchone()
        assert bal[0] == 1, f"On hand qty must remain 1 (got {bal[0]})"
        assert bal[1] == 1, f"Reserved qty must be exactly 1 (got {bal[1]})"


# ── TEST 4: ATP IDEMPOTENT RETRY (V-003) ───────────────────────────

@pytest.mark.asyncio
async def test_postgres_atp_idempotent_retry(pg_session: AsyncSession):
    winner = (await pg_session.execute(text("SELECT order_id FROM stock_reservations WHERE order_id IN ('ord_race_a', 'ord_race_b')"))).scalar_one()

    res = await pg_session.execute(
        text("SELECT public.pt_reserve_order_stock(:winner, 'admin_ops') as outcome"),
        {"winner": winner}
    )
    outcome = res.scalar_one()

    assert outcome["status"] == "already_reserved", f"Expected already_reserved on retry, got {outcome}"
    assert outcome["reservedQty"] == 1


# ── TEST 5: ORDER SNAPSHOT ANTI-TAMPER (V-004) ──────────────────────

@pytest.mark.asyncio
async def test_postgres_order_snapshot_anti_tamper(pg_session: AsyncSession):
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
        VALUES ('ord_snap_test', 'PTW-SNAP-01', 'org_buyer_snap', 'admin_ops', 'quoted', 'deposit_cod')
        ON CONFLICT (id) DO NOTHING
    """))
    await pg_session.execute(text("""
        INSERT INTO order_items (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot, variant_label_snapshot, supplier_id, quantity, unit_price_snapshot, locked)
        VALUES ('item_snap_1', 'ord_snap_test', 'P-RACE', 'Race Prod', 'SKU-RACE-1', 'Standard', 'sup_pettravel', 10, 1200000, true)
        ON CONFLICT (id) DO NOTHING
    """))
    await pg_session.commit()

    await pg_session.execute(text("UPDATE inventory_balances SET avg_cost_vnd = 999999 WHERE sku = 'SKU-RACE-1'"))
    await pg_session.commit()

    item_after = (await pg_session.execute(text("SELECT unit_price_snapshot FROM order_items WHERE id = 'item_snap_1'"))).scalar_one()
    assert item_after == 1200000, f"Order snapshot must NOT change! Expected 1,200,000, got {item_after}"


# ── TEST 6: PAYMENT REQUEST STATE MACHINE & SUPERSEDE (V-006) ───────

@pytest.mark.asyncio
async def test_postgres_payment_request_state_machine_and_supersede(pg_session: AsyncSession):
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
        VALUES ('ord_pay_flow', 'PTW-PAY-01', 'org_buyer_pay', 'admin_ops', 'quoted', 'deposit_cod')
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'quoted'
    """))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES ('q_pay_1', 'ord_pay_flow', 1, 'published', 500000, 500000, 150000, 350000, now() + interval '7 days')
        ON CONFLICT (id) DO NOTHING
    """))
    await pg_session.execute(text("""
        INSERT INTO payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
        VALUES ('pay_req_v1', 'ord_pay_flow', 'q_pay_1', 'deposit', 150000, 'REF-PAY-1', 'vietqr://pay1', 'active', now() + interval '1 day')
        ON CONFLICT (id) DO UPDATE SET status = 'active'
    """))
    await pg_session.commit()

    await pg_session.execute(text("UPDATE payment_requests SET status = 'superseded' WHERE id = 'pay_req_v1'"))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES ('q_pay_2', 'ord_pay_flow', 2, 'published', 600000, 600000, 180000, 420000, now() + interval '7 days')
        ON CONFLICT (id) DO NOTHING
    """))
    await pg_session.execute(text("""
        INSERT INTO payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
        VALUES ('pay_req_v2', 'ord_pay_flow', 'q_pay_2', 'deposit', 180000, 'REF-PAY-2', 'vietqr://pay2', 'active', now() + interval '1 day')
        ON CONFLICT (id) DO UPDATE SET status = 'active'
    """))
    await pg_session.commit()

    v1_status = (await pg_session.execute(text("SELECT status FROM payment_requests WHERE id = 'pay_req_v1'"))).scalar_one()
    v2_status = (await pg_session.execute(text("SELECT status FROM payment_requests WHERE id = 'pay_req_v2'"))).scalar_one()

    assert v1_status == "superseded"
    assert v2_status == "active"


# ── TEST 7: GENERAL LEDGER IDEMPOTENCY (V-008) ──────────────────────

@pytest.mark.asyncio
async def test_postgres_ledger_idempotency_and_balance(pg_session: AsyncSession):
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
        VALUES ('ord_acct_test', 'PTW-ACCT-01', 'org_buyer_acct', 'admin_ops', 'locked', 'deposit_cod', 1)
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
    """))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES ('q_acct_1', 'ord_acct_test', 1, 'accepted', 1000000, 1000000, 300000, 700000, now() + interval '7 days')
        ON CONFLICT (id) DO UPDATE SET status = 'accepted', final_total = 1000000
    """))
    await pg_session.execute(text("""
        INSERT INTO payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
        VALUES ('pay_acct_1', 'ord_acct_test', 'q_acct_1', 'deposit', 300000, 'REF-ACCT-1', 'vietqr://acct1', 'confirmed', now() + interval '1 day')
        ON CONFLICT (id) DO NOTHING
    """))
    await pg_session.commit()

    res1 = await pg_session.execute(
        text("SELECT public.pt_post_order_accounting('ord_acct_test', 'admin_ops', 'post_all', 1000, false) as outcome")
    )
    outcome1 = res1.scalar_one()
    await pg_session.commit()

    entries1 = (await pg_session.execute(text("SELECT id FROM journal_entries WHERE source_id = 'ord_acct_test' OR source_id = 'pay_acct_1'"))).mappings().all()
    assert len(entries1) >= 1

    for e in entries1:
        line_sums = (await pg_session.execute(text("""
            SELECT coalesce(sum(debit_amount), 0) as total_debit, coalesce(sum(credit_amount), 0) as total_credit
            FROM journal_lines WHERE entry_id = :entry_id
        """), {"entry_id": e["id"]})).mappings().one()
        assert line_sums["total_debit"] > 0, "Journal entry must have non-zero debits"
        assert line_sums["total_debit"] == line_sums["total_credit"], "General Ledger Invariant: Debit sum must equal Credit sum"

    res2 = await pg_session.execute(
        text("SELECT public.pt_post_order_accounting('ord_acct_test', 'admin_ops', 'post_all', 1000, false) as outcome")
    )
    outcome2 = res2.scalar_one()
    await pg_session.commit()

    assert outcome2["skippedEntries"] >= 1, "Idempotency retry must skip existing journal entries"
    assert outcome2["createdEntries"] == 0, "No duplicate journal entries may be created on retry"


# ── TEST 8: LEDGER FAILURE ATOMICITY ────────────────────────────────

@pytest.mark.asyncio
async def test_postgres_ledger_failure_atomicity(pg_session: AsyncSession):
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
        VALUES ('ord_invalid_acct', 'PTW-INV-01', 'org_buyer_inv', 'admin_ops', 'draft', 'deposit_cod')
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'draft'
    """))
    await pg_session.commit()

    with pytest.raises(Exception) as exc_info:
        await pg_session.execute(
            text("SELECT public.pt_post_order_accounting('ord_invalid_acct', 'admin_ops', 'post_all', 1000, false) as outcome")
        )
    assert "Order must be accepted, locked, packing, shipped, or delivered before sale recognition" in str(exc_info.value) or "Order was not found" in str(exc_info.value)
    await pg_session.rollback()

    count = (await pg_session.execute(text("SELECT count(*) FROM journal_entries WHERE source_id = 'ord_invalid_acct'"))).scalar_one()
    assert count == 0, "Failed accounting transaction must leave zero journal entries"


# ── TEST 9: DETERMINISTIC MULTI-SKU LOCK ORDERING ───────────────────

@pytest.mark.asyncio
async def test_postgres_atp_multi_sku_deterministic_lock_ordering(pg_engine):
    async_session = sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        await session.execute(text("""
            INSERT INTO inventory_balances (
                id, organization_id, warehouse_id, product_variant_id, sku, supplier_id,
                on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd, updated_at
            ) VALUES 
                ('bal_m_1', 'org_seller', 'wh_concur_1', 'var_m_1', 'SKU-AAA-1', 'sup_pettravel', 10, 0, 0, 100000, now()),
                ('bal_m_2', 'org_seller', 'wh_concur_1', 'var_m_2', 'SKU-ZZZ-2', 'sup_pettravel', 10, 0, 0, 100000, now())
            ON CONFLICT (id) DO UPDATE SET on_hand_qty = 10, reserved_qty = 0, defective_qty = 0
        """))
        await session.execute(text("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
            VALUES 
                ('ord_multi_1', 'PTW-MULTI-1', 'org_buyer_multi_1', 'admin_ops', 'customer_accepted', 'deposit_cod'),
                ('ord_multi_2', 'PTW-MULTI-2', 'org_buyer_multi_2', 'admin_ops', 'customer_accepted', 'deposit_cod')
            ON CONFLICT (id) DO UPDATE SET commercial_status = 'customer_accepted'
        """))
        await session.execute(text("""
            INSERT INTO order_items (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot, variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
            VALUES 
                ('item_m1_1', 'ord_multi_1', 'P-RACE', 'Race Prod', 'SKU-AAA-1', 'Standard', 'sup_pettravel', 2, 100000),
                ('item_m1_2', 'ord_multi_1', 'P-RACE', 'Race Prod', 'SKU-ZZZ-2', 'Standard', 'sup_pettravel', 2, 100000),
                ('item_m2_1', 'ord_multi_2', 'P-RACE', 'Race Prod', 'SKU-ZZZ-2', 'Standard', 'sup_pettravel', 2, 100000),
                ('item_m2_2', 'ord_multi_2', 'P-RACE', 'Race Prod', 'SKU-AAA-1', 'Standard', 'sup_pettravel', 2, 100000)
            ON CONFLICT (id) DO NOTHING
        """))
        await session.execute(text("DELETE FROM stock_reservations WHERE order_id IN ('ord_multi_1', 'ord_multi_2')"))
        await session.commit()

    async def call_reserve(order_id: str):
        async with async_session() as s:
            try:
                res = await s.execute(
                    text("SELECT public.pt_reserve_order_stock(:order_id, 'admin_ops') as outcome"),
                    {"order_id": order_id}
                )
                await s.commit()
                return {"success": True, "result": res.scalar_one(), "order_id": order_id}
            except Exception as e:
                await s.rollback()
                return {"success": False, "error": str(e), "order_id": order_id}

    results = await asyncio.gather(
        call_reserve("ord_multi_1"),
        call_reserve("ord_multi_2")
    )

    assert all(r["success"] for r in results), f"Expected both multi-SKU reservations to succeed without deadlock: {results}"
    
    async with async_session() as session:
        bal_aaa = (await session.execute(text("SELECT reserved_qty FROM inventory_balances WHERE id = 'bal_m_1'"))).scalar_one()
        bal_zzz = (await session.execute(text("SELECT reserved_qty FROM inventory_balances WHERE id = 'bal_m_2'"))).scalar_one()
        assert bal_aaa == 4, f"SKU-AAA-1 reserved qty must be 4 (got {bal_aaa})"
        assert bal_zzz == 4, f"SKU-ZZZ-2 reserved qty must be 4 (got {bal_zzz})"


# ── TEST 10: INTERNAL AUTH HTTP GATE ────────────────────────────────

@pytest.mark.asyncio
async def test_internal_auth_http_gate(monkeypatch, pg_session: AsyncSession):
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.core.config import settings
    from app.core.db import get_db

    monkeypatch.setattr(settings, "BACKEND_INTERNAL_SECRET", "super-secret-gate-token")

    async def override_get_db():
        yield pg_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res_no_auth = await client.post("/api/v1/accounting/order-posting", json={
                "orderId": "ord_acct_test",
                "actorId": "admin_ops"
            })
            assert res_no_auth.status_code == 401, f"Expected 401 without secret, got {res_no_auth.status_code}"

            res_wrong_auth = await client.post(
                "/api/v1/accounting/order-posting",
                headers={"x-backend-internal-secret": "wrong_secret"},
                json={"orderId": "ord_acct_test", "actorId": "admin_ops"}
            )
            assert res_wrong_auth.status_code == 401, f"Expected 401 with wrong secret, got {res_wrong_auth.status_code}"

            res_valid_auth = await client.post(
                "/api/v1/accounting/order-posting",
                headers={"x-backend-internal-secret": "super-secret-gate-token"},
                json={"orderId": "ord_acct_test", "actorId": "admin_ops", "mode": "post_all"}
            )
            assert res_valid_auth.status_code != 401, "Valid internal secret must pass auth gate"
    finally:
        app.dependency_overrides.pop(get_db, None)


# ── TEST 11: EXACT INTEGER VAT MATHEMATICS MATRIX ──────────────────

@pytest.mark.asyncio
async def test_vat_semantics_exact_integer_math(pg_session: AsyncSession):
    test_amounts = [1, 10, 99, 100, 999, 1000, 999999, 1000000]
    test_rates = [0, 800, 1000]

    for gross in test_amounts:
        for rate in test_rates:
            res = (await pg_session.execute(
                text("SELECT round((CAST(:gross AS NUMERIC) * CAST(:rate AS NUMERIC)) / (10000 + CAST(:rate AS NUMERIC))) as vat"),
                {"gross": gross, "rate": rate}
            )).scalar_one()

            expected_vat = round((gross * rate) / (10000 + rate))
            expected_net = gross - expected_vat

            assert int(res) == expected_vat, f"PostgreSQL VAT for gross {gross} at {rate} bps should be {expected_vat} (got {res})"
            assert (expected_net + expected_vat) == gross, f"Net + VAT must equal Gross exactly: {expected_net} + {expected_vat} != {gross}"


# ── TEST 12: NULL AND INVALID PARAMETER GUARDS ──────────────────────

@pytest.mark.asyncio
async def test_null_and_invalid_parameter_guards_in_accounting(pg_session: AsyncSession):
    with pytest.raises(Exception) as exc:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_acct_test', 'admin_ops', NULL, 1000, false)"))
    assert "INVALID_ACCOUNTING_MODE" in str(exc.value)
    await pg_session.rollback()

    with pytest.raises(Exception) as exc:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_acct_test', 'admin_ops', 'hack_mode', 1000, false)"))
    assert "INVALID_ACCOUNTING_MODE" in str(exc.value)
    await pg_session.rollback()

    with pytest.raises(Exception) as exc:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_acct_test', 'admin_ops', 'post_all', NULL, false)"))
    assert "INVALID_VAT_RATE" in str(exc.value)
    await pg_session.rollback()

    with pytest.raises(Exception) as exc:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_acct_test', 'admin_ops', 'post_all', -100, false)"))
    assert "INVALID_VAT_RATE" in str(exc.value)
    await pg_session.rollback()

    with pytest.raises(Exception) as exc:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_acct_test', 'admin_ops', 'post_all', 10001, false)"))
    assert "INVALID_VAT_RATE" in str(exc.value)
    await pg_session.rollback()

    with pytest.raises(Exception) as exc:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_acct_test', 'admin_ops', 'post_all', 1000, NULL)"))
    assert "INVALID_PARAMETER" in str(exc.value)
    await pg_session.rollback()


# ── TEST 13: SAME-ORDER CONCURRENT STOCK RESERVATION ───────────────

@pytest.mark.asyncio
async def test_same_order_concurrent_reservation_is_idempotent(pg_engine):
    async_session = sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        await session.execute(text("""
            INSERT INTO inventory_balances (
                id, organization_id, warehouse_id, product_variant_id, sku, supplier_id,
                on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd, updated_at
            ) VALUES (
                'bal_same_ord', 'org_seller', 'wh_concur_1', 'var_race_1', 'SKU-SAME-1', 'sup_pettravel',
                10, 0, 0, 100000, now()
            ) ON CONFLICT (id) DO UPDATE SET on_hand_qty = 10, reserved_qty = 0, defective_qty = 0
        """))
        await session.execute(text("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
            VALUES ('ord_same_race', 'PTW-SAME-RACE', 'org_buyer_same_race', 'admin_ops', 'customer_accepted', 'deposit_cod')
            ON CONFLICT (id) DO UPDATE SET commercial_status = 'customer_accepted'
        """))
        await session.execute(text("""
            INSERT INTO order_items (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot, variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
            VALUES ('item_same_race', 'ord_same_race', 'P-RACE', 'Race Prod', 'SKU-SAME-1', 'Standard', 'sup_pettravel', 2, 150000)
            ON CONFLICT (id) DO NOTHING
        """))
        await session.execute(text("DELETE FROM stock_reservations WHERE order_id = 'ord_same_race'"))
        await session.commit()

    async def call_reserve():
        async with async_session() as s:
            try:
                res = await s.execute(
                    text("SELECT public.pt_reserve_order_stock('ord_same_race', 'admin_ops') as outcome")
                )
                await s.commit()
                return {"success": True, "result": res.scalar_one()}
            except Exception as e:
                await s.rollback()
                return {"success": False, "error": str(e)}

    results = await asyncio.gather(call_reserve(), call_reserve())
    assert all(r["success"] for r in results), f"Both calls should succeed: {results}"

    statuses = [r["result"]["status"] for r in results]
    assert "reserved" in statuses, "One transaction must perform the reservation"
    assert "already_reserved" in statuses, "The competing transaction must return already_reserved"

    async with async_session() as session:
        bal = (await session.execute(text("SELECT reserved_qty FROM inventory_balances WHERE id = 'bal_same_ord'"))).scalar_one()
        assert bal == 2, f"Total reserved stock must be exactly 2 (got {bal})"


# ── TEST 14: SAME-ORDER CONCURRENT ACCOUNTING POSTING ──────────────

@pytest.mark.asyncio
async def test_same_order_concurrent_accounting_is_idempotent(pg_engine):
    async_session = sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        await session.execute(text("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
            VALUES ('ord_acct_concur', 'PTW-ACCT-CONCUR', 'org_buyer_acct_concur', 'admin_ops', 'locked', 'deposit_cod', 1)
            ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
        """))
        await session.execute(text("""
            INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            VALUES ('q_acct_concur', 'ord_acct_concur', 1, 'accepted', 1000000, 1000000, 300000, 700000, now() + interval '7 days')
            ON CONFLICT (id) DO UPDATE SET status = 'accepted', final_total = 1000000
        """))
        await session.execute(text("""
            INSERT INTO order_items (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot, variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
            VALUES ('item_acct_concur', 'ord_acct_concur', 'P-RACE', 'Race Prod', 'SKU-RACE-1', 'Standard', 'sup_pettravel', 1, 1000000)
            ON CONFLICT (id) DO NOTHING
        """))
        await session.execute(text("""
            INSERT INTO payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
            VALUES ('pay_acct_concur', 'ord_acct_concur', 'q_acct_concur', 'deposit', 300000, 'REF-ACCT-CONCUR', 'qr://acct_concur', 'confirmed', now() + interval '1 day')
            ON CONFLICT (id) DO UPDATE SET status = 'confirmed'
        """))
        await session.execute(text("""
            UPDATE payment_requests SET confirmed_at = now() WHERE id = 'pay_acct_concur'
        """))
        await session.commit()

    async def call_post():
        async with async_session() as s:
            try:
                res = await s.execute(
                    text("SELECT public.pt_post_order_accounting('ord_acct_concur', 'admin_ops', 'post_all', 1000, false) as outcome")
                )
                await s.commit()
                return {"success": True, "result": res.scalar_one()}
            except Exception as e:
                await s.rollback()
                return {"success": False, "error": str(e)}

    results = await asyncio.gather(call_post(), call_post())
    assert all(r["success"] for r in results), f"Both calls should succeed idempotently: {results}"

    async with async_session() as session:
        je_count = (await session.execute(text("SELECT count(*) FROM journal_entries WHERE description LIKE '%PTW-ACCT-CONCUR%'"))).scalar_one()
        assert je_count == 2, f"Must have exactly 2 journal entries (got {je_count})"


# ── TEST 15: MISSING COGS FAIL-CLOSED PROTECTION ───────────────────

@pytest.mark.asyncio
async def test_missing_cogs_rejected_if_required(pg_engine):
    async_session = sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        await session.execute(text("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
            VALUES ('ord_cogs_null', 'PTW-COGS-NULL', 'org_buyer_cogs_null', 'admin_ops', 'locked', 'deposit_cod', 1)
            ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
        """))
        await session.execute(text("""
            INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            VALUES ('q_cogs_null', 'ord_cogs_null', 1, 'accepted', 500000, 500000, 150000, 350000, now() + interval '7 days')
            ON CONFLICT (id) DO UPDATE SET status = 'accepted', final_total = 500000
        """))
        await session.execute(text("""
            INSERT INTO order_items (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot, variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
            VALUES ('item_cogs_null', 'ord_cogs_null', 'P-RACE', 'Race Prod', 'SKU-RACE-1', 'Standard', 'sup_pettravel', 1, 500000)
            ON CONFLICT (id) DO NOTHING
        """))
        await session.execute(text("""
            INSERT INTO operations_documents (id, organization_id, type, document_no, status, created_by)
            VALUES ('doc_cogs_missing', 'org_seller', 'sales_invoice', 'INV-TEST-01', 'posted', 'admin_ops')
            ON CONFLICT (id) DO NOTHING
        """))
        await session.execute(text("""
            INSERT INTO stock_reservations (
                id, organization_id, warehouse_id, order_id, order_item_id, product_variant_id,
                sku_snapshot, quantity, status, consumed_document_id, created_by
            ) VALUES (
                'res_cogs_null', 'org_seller', 'wh_concur_1', 'ord_cogs_null', 'item_cogs_null', 'var_race_1',
                'SKU-RACE-1', 1, 'consumed', 'doc_cogs_missing', 'admin_ops'
            ) ON CONFLICT (id) DO NOTHING
        """))
        await session.execute(text("ALTER TABLE stock_movements ALTER COLUMN unit_cost DROP NOT NULL"))
        await session.execute(text("""
            INSERT INTO stock_movements (
                id, organization_id, warehouse_id, document_id, product_variant_id,
                sku_snapshot, movement_type, quantity_delta, unit_cost, created_by
            ) VALUES (
                'sm_cogs_null', 'org_seller', 'wh_concur_1', 'doc_cogs_missing', 'var_race_1',
                'SKU-RACE-1', 'sale_out', -1, NULL, 'admin_ops'
            ) ON CONFLICT (id) DO NOTHING
        """))
        await session.commit()

        with pytest.raises(Exception) as exc_info:
            await session.execute(text("SELECT public.pt_post_order_accounting('ord_cogs_null', 'admin_ops', 'recognize_sale', 1000, true)"))
        assert "ACCOUNTING_COGS_MISSING" in str(exc_info.value)


# ── TEST 16: DIRECT AUTHENTICATED / ANON RPC DENIED ─────────────────

@pytest.mark.asyncio
async def test_authenticated_and_anon_cannot_execute_rpcs_directly(pg_session: AsyncSession):
    anon_reserve = (await pg_session.execute(text(
        "SELECT has_function_privilege('anon', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')"
    ))).scalar_one()
    auth_reserve = (await pg_session.execute(text(
        "SELECT has_function_privilege('authenticated', 'public.pt_reserve_order_stock(text,text,timestamptz)', 'EXECUTE')"
    ))).scalar_one()
    anon_acct = (await pg_session.execute(text(
        "SELECT has_function_privilege('anon', 'public.pt_post_order_accounting(text,text,text,integer,boolean)', 'EXECUTE')"
    ))).scalar_one()
    auth_acct = (await pg_session.execute(text(
        "SELECT has_function_privilege('authenticated', 'public.pt_post_order_accounting(text,text,text,integer,boolean)', 'EXECUTE')"
    ))).scalar_one()

    assert anon_reserve is False, "anon must not have EXECUTE on pt_reserve_order_stock"
    assert auth_reserve is False, "authenticated must not have EXECUTE on pt_reserve_order_stock"
    assert anon_acct is False, "anon must not have EXECUTE on pt_post_order_accounting"
    assert auth_acct is False, "authenticated must not have EXECUTE on pt_post_order_accounting"


# ── TEST 17: ACTOR SPOOFING REJECTED AT PRIVILEGE BOUNDARY ──────────

@pytest.mark.asyncio
async def test_actor_id_spoofing_rejected():
    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database="pettravel_test"
    )
    try:
        await conn.execute("GRANT USAGE ON SCHEMA public TO authenticated;")
        await conn.execute("SET ROLE authenticated;")
        with pytest.raises(Exception) as exc_info:
            await conn.fetchval(
                "SELECT public.pt_post_order_accounting('ord_acct_test'::text, 'admin_ops'::text, 'post_all'::text, 1000::integer, false::boolean)"
            )
        assert "permission denied" in str(exc_info.value).lower(), "Authenticated caller must be denied EXECUTE"
    finally:
        try:
            await conn.execute("RESET ROLE;")
        except Exception:
            pass
        await conn.close()


# ── TEST 18: BACKEND SERVICE ROLE & DEDICATED STAGING ROLE CAN EXECUTE RPCS ──

@pytest.mark.asyncio
async def test_backend_role_can_execute_rpcs():
    conn = await asyncpg.connect(
        user=POSTGRES_TEST_USER, password=POSTGRES_TEST_PASS,
        host=POSTGRES_TEST_HOST, port=POSTGRES_TEST_PORT, database="pettravel_test"
    )
    try:
        await conn.execute("GRANT USAGE ON SCHEMA public TO service_role;")
        await conn.execute("SET ROLE service_role;")
        res1 = await conn.fetchval(
            "SELECT public.pt_post_order_accounting('ord_acct_test'::text, 'admin_ops'::text, 'post_all'::text, 1000::integer, false::boolean)"
        )
        assert res1 is not None, "service_role execution should succeed"
        await conn.execute("RESET ROLE;")

        await conn.execute("""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend_staging') THEN
                    CREATE ROLE pettravel_backend_staging NOLOGIN;
                END IF;
            END $$;
        """)
        await conn.execute("GRANT USAGE ON SCHEMA public TO pettravel_backend_staging;")
        await conn.execute("GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO pettravel_backend_staging;")
        await conn.execute("GRANT EXECUTE ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) TO pettravel_backend_staging;")
        await conn.execute("SET ROLE pettravel_backend_staging;")
        res2 = await conn.fetchval(
            "SELECT public.pt_post_order_accounting('ord_acct_test'::text, 'admin_ops'::text, 'post_all'::text, 1000::integer, false::boolean)"
        )
        assert res2 is not None, "pettravel_backend_staging execution should succeed"
    finally:
        try:
            await conn.execute("RESET ROLE;")
        except Exception:
            pass
        await conn.close()


# ── TEST 19: INACTIVE OR MISSING ACTOR REJECTED ────────────────────

@pytest.mark.asyncio
async def test_inactive_or_missing_actor_rejected(pg_session: AsyncSession):
    await pg_session.execute(text("""
        INSERT INTO app_users (id, organization_id, full_name, email, status)
        VALUES ('user_disabled', 'org_seller', 'Disabled Staff', 'disabled@pettravel.vn', 'disabled')
        ON CONFLICT (id) DO UPDATE SET status = 'disabled'
    """))
    await pg_session.commit()

    with pytest.raises(Exception) as exc_info:
        await pg_session.execute(text(
            "SELECT public.pt_post_order_accounting('ord_acct_test', 'user_disabled', 'post_all', 1000, false)"
        ))
    assert "Actor is not attached to an internal accounting organization" in str(exc_info.value)
    await pg_session.rollback()

    with pytest.raises(Exception) as exc_info:
        await pg_session.execute(text(
            "SELECT public.pt_post_order_accounting('ord_acct_test', 'user_ghost', 'post_all', 1000, false)"
        ))
    assert "Actor is not attached to an internal accounting organization" in str(exc_info.value)
    await pg_session.rollback()


# ── TEST 20: ACTOR WITHOUT PERMISSION REJECTED ─────────────────────

@pytest.mark.asyncio
async def test_actor_without_permission_rejected(pg_session: AsyncSession):
    await pg_session.execute(text("""
        INSERT INTO app_users (id, organization_id, full_name, email, status)
        VALUES ('user_warehouse_only', 'org_seller', 'Warehouse Staff', 'wh@pettravel.vn', 'active')
        ON CONFLICT (id) DO UPDATE SET status = 'active'
    """))
    await pg_session.commit()

    with pytest.raises(Exception) as exc_info:
        await pg_session.execute(text(
            "SELECT public.pt_post_order_accounting('ord_acct_test', 'user_warehouse_only', 'post_all', 1000, false)"
        ))
    assert "Actor is not allowed to post accounting entries" in str(exc_info.value)
    await pg_session.rollback()


# ── TEST 21: CROSS-ORGANIZATION BOUNDARY PROTECTION ────────────────

@pytest.mark.asyncio
async def test_cross_org_isolation_in_reservation_and_accounting(pg_session: AsyncSession):
    await pg_session.execute(text("""
        INSERT INTO app_users (id, organization_id, full_name, email, status)
        VALUES ('buyer_actor', 'org_buyer_cross', 'Buyer Actor', 'buyer_actor@buyer.vn', 'active')
        ON CONFLICT (id) DO UPDATE SET status = 'active'
    """))
    await pg_session.execute(text("""
        INSERT INTO roles (id, key, name, is_system) VALUES ('role_rogue_acct', 'rogue_acct', 'Rogue', false) ON CONFLICT (id) DO NOTHING
    """))
    await pg_session.execute(text("""
        INSERT INTO role_permissions (role_id, permission_key) VALUES ('role_rogue_acct', 'accounting.post') ON CONFLICT DO NOTHING
    """))
    await pg_session.execute(text("""
        INSERT INTO user_roles (user_id, role_id) VALUES ('buyer_actor', 'role_rogue_acct') ON CONFLICT DO NOTHING
    """))
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
        VALUES ('ord_cross_test', 'PTW-CROSS-01', 'org_buyer_cross', 'admin_ops', 'locked', 'deposit_cod', 1)
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
    """))
    await pg_session.commit()

    with pytest.raises(Exception) as exc_info:
        await pg_session.execute(text(
            "SELECT public.pt_post_order_accounting('ord_cross_test', 'buyer_actor', 'post_all', 1000, false)"
        ))
    assert "FORBIDDEN_CROSS_ORG" in str(exc_info.value)
    await pg_session.rollback()


# ── TEST 22: COGS OVERRIDE PROTECTION (p_require_consumed_stock) ───

@pytest.mark.asyncio
async def test_require_consumed_stock_false_cannot_be_abused(pg_session: AsyncSession):
    await pg_session.execute(text("""
        INSERT INTO app_users (id, organization_id, full_name, email, status)
        VALUES ('user_reg_acct', 'org_seller', 'Regular Accountant', 'acct@pettravel.vn', 'active')
        ON CONFLICT (id) DO UPDATE SET status = 'active'
    """))
    await pg_session.execute(text("""
        INSERT INTO roles (id, key, name, is_system) VALUES ('role_plain_acct', 'plain_acct', 'Plain Accountant', false) ON CONFLICT (id) DO NOTHING
    """))
    await pg_session.execute(text("""
        INSERT INTO role_permissions (role_id, permission_key) VALUES ('role_plain_acct', 'accounting.post') ON CONFLICT DO NOTHING
    """))
    await pg_session.execute(text("""
        INSERT INTO user_roles (user_id, role_id) VALUES ('user_reg_acct', 'role_plain_acct') ON CONFLICT DO NOTHING
    """))
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
        VALUES ('ord_no_cogs', 'PTW-NO-COGS', 'org_buyer_no_cogs', 'admin_ops', 'locked', 'deposit_cod', 1)
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
    """))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES ('q_no_cogs', 'ord_no_cogs', 1, 'accepted', 500000, 500000, 150000, 350000, now() + interval '7 days')
        ON CONFLICT (id) DO UPDATE SET status = 'accepted', final_total = 500000
    """))
    await pg_session.execute(text("DELETE FROM stock_reservations WHERE order_id = 'ord_no_cogs'"))
    await pg_session.commit()
    
    with pytest.raises(Exception) as exc_info:
        await pg_session.execute(text(
            "SELECT public.pt_post_order_accounting('ord_no_cogs', 'user_reg_acct', 'recognize_sale', 1000, false)"
        ))
    assert "FORBIDDEN_COGS_OVERRIDE" in str(exc_info.value)
    await pg_session.rollback()


# ── TEST 23: ACCEPTED COMMERCIAL SNAPSHOT SOURCE OF TRUTH (MATRIX A..J) ──

@pytest.mark.asyncio
async def test_accounting_commercial_sot_matrix_a_through_j(pg_session: AsyncSession):
    await pg_session.execute(text("""
        INSERT INTO operations_documents (id, organization_id, type, document_no, status, created_by)
        VALUES ('doc_sot', 'org_seller', 'sales_invoice', 'INV-SOT-01', 'posted', 'admin_ops')
        ON CONFLICT (id) DO NOTHING
    """))

    async def setup_consumed_stock(order_id: str, item_id: str, res_id: str, sm_id: str):
        await pg_session.execute(text(f"""
            INSERT INTO order_items (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot, variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
            VALUES ('{item_id}', '{order_id}', 'P-RACE', 'Race Prod', 'SKU-RACE-1', 'Standard', 'sup_pettravel', 1, 1000000)
            ON CONFLICT (id) DO NOTHING
        """))
        await pg_session.execute(text(f"""
            INSERT INTO stock_reservations (
                id, organization_id, warehouse_id, order_id, order_item_id, product_variant_id,
                sku_snapshot, quantity, status, consumed_document_id, created_by
            ) VALUES (
                '{res_id}', 'org_seller', 'wh_concur_1', '{order_id}', '{item_id}', 'var_race_1',
                'SKU-RACE-1', 1, 'consumed', 'doc_sot', 'admin_ops'
            ) ON CONFLICT (id) DO NOTHING
        """))
        await pg_session.execute(text(f"""
            INSERT INTO stock_movements (
                id, organization_id, warehouse_id, document_id, product_variant_id,
                sku_snapshot, movement_type, quantity_delta, unit_cost, created_by
            ) VALUES (
                '{sm_id}', 'org_seller', 'wh_concur_1', 'doc_sot', 'var_race_1',
                'SKU-RACE-1', 'sale_out', -1, 400000, 'admin_ops'
            ) ON CONFLICT (id) DO NOTHING
        """))

    async def get_financial_counts(order_id: str):
        je_count = (await pg_session.execute(text(f"SELECT count(*) FROM journal_entries WHERE source_id = '{order_id}'"))).scalar_one()
        jl_count = (await pg_session.execute(text(f"SELECT count(*) FROM journal_lines WHERE order_id = '{order_id}'"))).scalar_one()
        rle_count = (await pg_session.execute(text(f"SELECT count(*) FROM receivable_ledger_entries WHERE source_id = '{order_id}'"))).scalar_one()
        return je_count, jl_count, rle_count

    # Case A
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
        VALUES ('ord_sot_a', 'PTW-SOT-A', 'org_buyer_sot_a', 'admin_ops', 'locked', 'deposit_cod', 1)
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
    """))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES 
            ('q_sot_a1', 'ord_sot_a', 1, 'accepted', 1000000, 1000000, 300000, 700000, now() + interval '7 days'),
            ('q_sot_a2', 'ord_sot_a', 2, 'draft', 1500000, 1500000, 450000, 1050000, now() + interval '7 days')
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, final_total = EXCLUDED.final_total
    """))
    await setup_consumed_stock('ord_sot_a', 'item_sot_a', 'res_sot_a', 'sm_sot_a')
    await pg_session.commit()

    res_a = await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_sot_a', 'admin_ops', 'recognize_sale', 1000, true) as outcome"))
    await pg_session.commit()
    assert res_a.scalar_one()["createdEntries"] == 1
    lines_a = (await pg_session.execute(text("SELECT account_code, debit_amount, credit_amount FROM journal_lines WHERE order_id = 'ord_sot_a' ORDER BY line_no"))).fetchall()
    dr_131_a = [l[1] for l in lines_a if l[0] == '131'][0]
    assert dr_131_a == 1000000, f"Case A: Must be 1,000,000 from accepted V1 (got {dr_131_a})"

    # Case B
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
        VALUES ('ord_sot_b', 'PTW-SOT-B', 'org_buyer_sot_b', 'admin_ops', 'locked', 'deposit_cod', 1)
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
    """))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES 
            ('q_sot_b1', 'ord_sot_b', 1, 'accepted', 1000000, 1000000, 300000, 700000, now() + interval '7 days'),
            ('q_sot_b2', 'ord_sot_b', 2, 'published', 1200000, 1200000, 360000, 840000, now() + interval '7 days')
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, final_total = EXCLUDED.final_total
    """))
    await setup_consumed_stock('ord_sot_b', 'item_sot_b', 'res_sot_b', 'sm_sot_b')
    await pg_session.commit()

    res_b = await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_sot_b', 'admin_ops', 'recognize_sale', 1000, true) as outcome"))
    await pg_session.commit()
    assert res_b.scalar_one()["createdEntries"] == 1
    lines_b = (await pg_session.execute(text("SELECT account_code, debit_amount, credit_amount FROM journal_lines WHERE order_id = 'ord_sot_b' ORDER BY line_no"))).fetchall()
    dr_131_b = [l[1] for l in lines_b if l[0] == '131'][0]
    assert dr_131_b == 1000000, f"Case B: Must be 1,000,000 from accepted V1 (got {dr_131_b})"

    # Case C
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
        VALUES ('ord_sot_c', 'PTW-SOT-C', 'org_buyer_sot_c', 'admin_ops', 'customer_accepted', 'deposit_cod', 1)
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'customer_accepted', current_quote_version = 1
    """))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES ('q_sot_c1', 'ord_sot_c', 1, 'published', 800000, 800000, 240000, 560000, now() + interval '7 days')
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, final_total = EXCLUDED.final_total
    """))
    await setup_consumed_stock('ord_sot_c', 'item_sot_c', 'res_sot_c', 'sm_sot_c')
    await pg_session.commit()

    je_before_c, jl_before_c, rle_before_c = await get_financial_counts('ord_sot_c')
    with pytest.raises(Exception) as exc_c:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_sot_c', 'admin_ops', 'recognize_sale', 1000, true)"))
    assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in str(exc_c.value)
    await pg_session.rollback()
    je_after_c, jl_after_c, rle_after_c = await get_financial_counts('ord_sot_c')
    assert (je_after_c, jl_after_c, rle_after_c) == (je_before_c, jl_before_c, rle_before_c) == (0, 0, 0), "Case C: Zero financial side effects"

    # Case D
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
        VALUES ('ord_sot_d', 'PTW-SOT-D', 'org_buyer_sot_d', 'admin_ops', 'locked', 'deposit_cod', 1)
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
    """))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES ('q_sot_d1', 'ord_sot_d', 1, 'published', 900000, 900000, 270000, 630000, now() + interval '7 days')
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, final_total = EXCLUDED.final_total
    """))
    await setup_consumed_stock('ord_sot_d', 'item_sot_d', 'res_sot_d', 'sm_sot_d')
    await pg_session.commit()

    with pytest.raises(Exception) as exc_d:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_sot_d', 'admin_ops', 'recognize_sale', 1000, true)"))
    assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in str(exc_d.value)
    await pg_session.rollback()
    je_after_d, jl_after_d, rle_after_d = await get_financial_counts('ord_sot_d')
    assert (je_after_d, jl_after_d, rle_after_d) == (0, 0, 0), "Case D: Zero financial side effects"

    # Case E
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
        VALUES ('ord_sot_e', 'PTW-SOT-E', 'org_buyer_sot_e', 'admin_ops', 'locked', 'deposit_cod', 1)
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
    """))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES ('q_sot_e1', 'ord_sot_e', 1, 'draft', 950000, 950000, 285000, 665000, now() + interval '7 days')
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, final_total = EXCLUDED.final_total
    """))
    await setup_consumed_stock('ord_sot_e', 'item_sot_e', 'res_sot_e', 'sm_sot_e')
    await pg_session.commit()

    with pytest.raises(Exception) as exc_e:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_sot_e', 'admin_ops', 'recognize_sale', 1000, true)"))
    assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in str(exc_e.value)
    await pg_session.rollback()
    je_after_e, jl_after_e, rle_after_e = await get_financial_counts('ord_sot_e')
    assert (je_after_e, jl_after_e, rle_after_e) == (0, 0, 0), "Case E: Zero financial side effects"

    # Case F
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
        VALUES ('ord_sot_f', 'PTW-SOT-F', 'org_buyer_sot_f', 'admin_ops', 'locked', 'deposit_cod')
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked'
    """))
    await pg_session.execute(text("DELETE FROM quote_versions WHERE order_id = 'ord_sot_f'"))
    await setup_consumed_stock('ord_sot_f', 'item_sot_f', 'res_sot_f', 'sm_sot_f')
    await pg_session.commit()

    with pytest.raises(Exception) as exc_f:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_sot_f', 'admin_ops', 'recognize_sale', 1000, true)"))
    assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in str(exc_f.value)
    await pg_session.rollback()
    je_after_f, jl_after_f, rle_after_f = await get_financial_counts('ord_sot_f')
    assert (je_after_f, jl_after_f, rle_after_f) == (0, 0, 0), "Case F: Zero financial side effects"

    # Case G
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
        VALUES ('ord_sot_g', 'PTW-SOT-G', 'org_buyer_sot_g', 'admin_ops', 'locked', 'deposit_cod')
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked'
    """))
    await pg_session.execute(text("DELETE FROM quote_versions WHERE order_id = 'ord_sot_g'"))
    await pg_session.execute(text("DELETE FROM order_items WHERE order_id = 'ord_sot_g'"))
    await pg_session.commit()

    with pytest.raises(Exception) as exc_g:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_sot_g', 'admin_ops', 'recognize_sale', 1000, true)"))
    assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in str(exc_g.value)
    await pg_session.rollback()
    je_after_g, jl_after_g, rle_after_g = await get_financial_counts('ord_sot_g')
    assert (je_after_g, jl_after_g, rle_after_g) == (0, 0, 0), "Case G: Zero financial side effects"

    # Case H
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
        VALUES ('ord_sot_h', 'PTW-SOT-H', 'org_buyer_sot_h', 'admin_ops', 'locked', 'deposit_cod', 1)
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
    """))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES ('q_sot_h1', 'ord_sot_h', 1, 'accepted', 0, 0, 0, 0, now() + interval '7 days')
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, final_total = EXCLUDED.final_total
    """))
    await setup_consumed_stock('ord_sot_h', 'item_sot_h', 'res_sot_h', 'sm_sot_h')
    await pg_session.commit()

    with pytest.raises(Exception) as exc_h:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_sot_h', 'admin_ops', 'recognize_sale', 1000, true)"))
    assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING" in str(exc_h.value)
    await pg_session.rollback()
    je_after_h, jl_after_h, rle_after_h = await get_financial_counts('ord_sot_h')
    assert (je_after_h, jl_after_h, rle_after_h) == (0, 0, 0), "Case H: Zero financial side effects"

    # Case I
    await pg_session.execute(text("DROP INDEX IF EXISTS uq_quote_versions_single_accepted;"))
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
        VALUES ('ord_sot_i', 'PTW-SOT-I', 'org_buyer_sot_i', 'admin_ops', 'locked', 'deposit_cod', 1)
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
    """))
    await pg_session.execute(text("""
        INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        VALUES 
            ('q_sot_i1', 'ord_sot_i', 1, 'accepted', 1000000, 1000000, 300000, 700000, now() + interval '7 days'),
            ('q_sot_i2', 'ord_sot_i', 2, 'accepted', 1100000, 1100000, 330000, 770000, now() + interval '7 days')
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, final_total = EXCLUDED.final_total
    """))
    await setup_consumed_stock('ord_sot_i', 'item_sot_i', 'res_sot_i', 'sm_sot_i')
    await pg_session.commit()

    with pytest.raises(Exception) as exc_i:
        await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_sot_i', 'admin_ops', 'recognize_sale', 1000, true)"))
    assert "ACCOUNTING_COMMERCIAL_SNAPSHOT_AMBIGUOUS" in str(exc_i.value)
    await pg_session.rollback()
    je_after_i, jl_after_i, rle_after_i = await get_financial_counts('ord_sot_i')
    assert (je_after_i, jl_after_i, rle_after_i) == (0, 0, 0), "Case I: Zero financial side effects"

    await pg_session.execute(text("ALTER TABLE quote_versions DISABLE TRIGGER trg_guard_accepted_quote_immutability;"))
    await pg_session.execute(text("DELETE FROM quote_versions WHERE id = 'q_sot_i2';"))
    await pg_session.execute(text("ALTER TABLE quote_versions ENABLE TRIGGER trg_guard_accepted_quote_immutability;"))
    await pg_session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_versions_single_accepted ON quote_versions (order_id) WHERE status = 'accepted';"))
    await pg_session.commit()

    # Case J
    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
        VALUES ('ord_sot_j', 'PTW-SOT-J', 'org_buyer_sot_j', 'admin_ops', 'draft', 'deposit_cod')
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'draft'
    """))
    await pg_session.execute(text("""
        INSERT INTO payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at, confirmed_at)
        VALUES ('pay_sot_j1', 'ord_sot_j', 'q_sot_a1', 'deposit', 250000, 'REF-SOT-J1', 'vietqr://j1', 'confirmed', now() + interval '1 day', now())
        ON CONFLICT (id) DO UPDATE SET status = 'confirmed'
    """))
    await pg_session.commit()

    res_j = await pg_session.execute(text("SELECT public.pt_post_order_accounting('ord_sot_j', 'admin_ops', 'post_confirmed_payments', 0, false) as outcome"))
    await pg_session.commit()
    outcome_j = res_j.scalar_one()
    assert outcome_j["createdEntries"] == 1
    assert outcome_j["createdReceivables"] == 1
    assert outcome_j["createdAllocations"] == 1


# ── TEST 24: INVENTORY BALANCE TIE-BREAK IS DETERMINISTIC ───────────

@pytest.mark.asyncio
async def test_inventory_balance_tie_break_is_deterministic(pg_session: AsyncSession):
    now_ts = "2026-08-16 00:00:00+00"
    await pg_session.execute(text(f"""
        INSERT INTO inventory_balances (
            id, organization_id, warehouse_id, product_variant_id, sku, supplier_id,
            on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd, updated_at
        ) VALUES 
            ('bal_tie_z', 'org_seller', 'wh_tie_b', 'var_race_1', 'SKU-TIE-1', 'sup_pettravel', 10, 0, 0, 100000, '{now_ts}'),
            ('bal_tie_a', 'org_seller', 'wh_tie_a', 'var_race_1', 'SKU-TIE-1', 'sup_pettravel', 10, 0, 0, 100000, '{now_ts}')
        ON CONFLICT (id) DO UPDATE SET on_hand_qty = 10, reserved_qty = 0, defective_qty = 0, updated_at = '{now_ts}'
    """))

    await pg_session.execute(text("""
        INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent)
        VALUES ('ord_tie_test', 'PTW-TIE-TEST', 'org_buyer_tie', 'admin_ops', 'customer_accepted', 'deposit_cod')
        ON CONFLICT (id) DO UPDATE SET commercial_status = 'customer_accepted'
    """))
    await pg_session.execute(text("""
        INSERT INTO order_items (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot, variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
        VALUES ('item_tie', 'ord_tie_test', 'P-RACE', 'Race Prod', 'SKU-TIE-1', 'Standard', 'sup_pettravel', 1, 100000)
        ON CONFLICT (id) DO NOTHING
    """))
    await pg_session.execute(text("DELETE FROM stock_reservations WHERE order_id = 'ord_tie_test'"))
    await pg_session.commit()

    res = await pg_session.execute(text("SELECT public.pt_reserve_order_stock('ord_tie_test', 'admin_ops') as outcome"))
    await pg_session.commit()
    assert res.scalar_one()["status"] == "reserved"

    res_wh = (await pg_session.execute(text("SELECT warehouse_id FROM stock_reservations WHERE order_id = 'ord_tie_test'"))).scalar_one()
    assert res_wh == 'wh_tie_a', f"Deterministic tie-breaker must pick 'bal_tie_a' warehouse 'wh_tie_a' (got {res_wh})"


# ── TEST 25: CATALOG PRIVILEGE AND SEARCH_PATH ASSERTIONS ───────────

@pytest.mark.asyncio
async def test_catalog_privilege_and_search_path_assertions(pg_session: AsyncSession):
    procs = (await pg_session.execute(text("""
        SELECT proname, prosecdef, proconfig
        FROM pg_proc
        WHERE proname IN ('pt_reserve_order_stock', 'pt_post_order_accounting')
    """))).fetchall()

    for p in procs:
        assert p[1] is True, f"{p[0]} must be SECURITY DEFINER"
        assert p[2] is not None and "search_path=" in p[2][0], f"{p[0]} must have search_path='' (got {p[2]})"


# ── TEST 26: CONCURRENT QUOTE CHANGE ATTEMPT VS SALE RECOGNITION ───

@pytest.mark.asyncio
async def test_concurrent_quote_change_vs_sale_recognition(pg_engine):
    AsyncSessionLocal = sessionmaker(bind=pg_engine, class_=AsyncSession, expire_on_commit=False)
    async with AsyncSessionLocal() as session:
        await session.execute(text("""
            INSERT INTO customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, current_quote_version)
            VALUES ('ord_race_quote', 'PTW-RACE-Q', 'org_buyer_race_q', 'admin_ops', 'locked', 'deposit_cod', 1)
            ON CONFLICT (id) DO UPDATE SET commercial_status = 'locked', current_quote_version = 1
        """))
        await session.execute(text("""
            INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            VALUES ('q_race_v1', 'ord_race_quote', 1, 'accepted', 1000000, 1000000, 300000, 700000, now() + interval '7 days')
            ON CONFLICT (id) DO UPDATE SET status = 'accepted', final_total = 1000000
        """))
        await session.execute(text("""
            INSERT INTO order_items (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot, variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
            VALUES ('item_race_q', 'ord_race_quote', 'P-RACE', 'Race Prod', 'SKU-RACE-1', 'Standard', 'sup_pettravel', 1, 1000000)
            ON CONFLICT (id) DO NOTHING
        """))
        await session.execute(text("""
            INSERT INTO stock_reservations (
                id, organization_id, warehouse_id, order_id, order_item_id, product_variant_id,
                sku_snapshot, quantity, status, consumed_document_id, created_by
            ) VALUES (
                'res_race_q', 'org_seller', 'wh_concur_1', 'ord_race_quote', 'item_race_q', 'var_race_1',
                'SKU-RACE-1', 1, 'consumed', 'doc_sot', 'admin_ops'
            ) ON CONFLICT (id) DO NOTHING
        """))
        await session.execute(text("""
            INSERT INTO stock_movements (
                id, organization_id, warehouse_id, document_id, product_variant_id,
                sku_snapshot, movement_type, quantity_delta, unit_cost, created_by
            ) VALUES (
                'sm_race_q', 'org_seller', 'wh_concur_1', 'doc_sot', 'var_race_1',
                'SKU-RACE-1', 'sale_out', -1, 400000, 'admin_ops'
            ) ON CONFLICT (id) DO NOTHING
        """))
        await session.commit()

    async def worker_accounting():
        async with AsyncSessionLocal() as session:
            res = await session.execute(text(
                "SELECT public.pt_post_order_accounting('ord_race_quote', 'admin_ops', 'recognize_sale', 1000, true) as outcome"
            ))
            await session.commit()
            return res.scalar_one()

    async def worker_quote_add():
        async with AsyncSessionLocal() as session:
            await session.execute(text("""
                INSERT INTO quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
                VALUES ('q_race_v2', 'ord_race_quote', 2, 'draft', 1500000, 1500000, 450000, 1050000, now() + interval '7 days')
                ON CONFLICT (id) DO NOTHING
            """))
            await session.commit()
            return "quote_added"

    results = await asyncio.gather(worker_accounting(), worker_quote_add(), return_exceptions=True)
    assert not isinstance(results[0], Exception), f"Accounting worker failed: {results[0]}"
    assert not isinstance(results[1], Exception), f"Quote worker failed: {results[1]}"

    async with AsyncSessionLocal() as session:
        line_131 = (await session.execute(text("SELECT debit_amount FROM journal_lines WHERE order_id = 'ord_race_quote' AND account_code = '131'"))).scalar_one()
        assert line_131 == 1000000, f"Receivable must be 1,000,000 from accepted quote V1 (got {line_131})"
