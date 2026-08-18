from __future__ import annotations

import datetime
from datetime import timezone
import pytest
from sqlalchemy import text

from app.repositories.orders import OrderConflictError, save_order
from app.repositories.order_read import get_orders_revision, list_orders
from app.services.pricing import calculate_quote_financials
from app.services.order_workflow import stock_command_for_transition


@pytest.mark.asyncio
async def test_create_order_enforces_one_active_order_per_org(canonical_db_session):
    """Ensure organization cannot create second active order concurrently."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_active_test', 'Đại lý Test')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('user_active_1', 'org_active_test', 'Chủ đại lý', 'active_test@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into suppliers (id, code, name, active) values ('sup_1', 'SUP-1', 'NCC', 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into products (id, code, name, brand, category, active)
            values ('prod_1', 'PT-1', 'Túi chuẩn', 'Pet Travel', 'Túi', 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into product_variants (id, product_id, sku, label, active)
            values ('var_1', 'prod_1', 'SKU-1', 'Xanh', 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into supplier_offers
            (id, supplier_id, product_variant_id, wholesale_price, min_order_qty, stock_qty, active)
            values ('offer_1', 'sup_1', 'var_1', 100000, 1, 20, 1)""")
    )
    await canonical_db_session.commit()

    # 1. First order succeeds
    res1 = await save_order(
        canonical_db_session,
        actor_id="user_active_1",
        order={
            "id": "order_first",
            "items": [{"variantSku": "SKU-1", "supplierId": "sup_1", "quantity": 1}],
            "paymentIntent": "deposit_cod",
        },
    )
    assert res1["orderId"] == "order_first"

    # 2. Second order for same active organization is rejected
    with pytest.raises(ValueError, match="Tổ chức đang có một đơn hàng hoạt động"):
        await save_order(
            canonical_db_session,
            actor_id="user_active_1",
            order={
                "id": "order_second",
                "items": [{"variantSku": "SKU-1", "supplierId": "sup_1", "quantity": 1}],
                "paymentIntent": "deposit_cod",
            },
        )


@pytest.mark.asyncio
async def test_customer_accept_quote_persists_accepted_state_and_locks_items(canonical_db_session):
    """Accepting a quote moves quote to accepted, locks order items, and creates payment request."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_cust', 'Đại lý Mua')"))
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_seller', 'Pet Travel')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('cust_1', 'org_cust', 'Khách mua', 'cust@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('admin_1', 'org_seller', 'Quản trị viên', 'admin@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_accept_test', 'PTW-2026-001', 'org_cust', 'cust_1', 'quoted', 'unrequested',
                    'deposit_cod', 1, '2026-08-18 10:00:00')""")
    )
    await canonical_db_session.execute(
        text("""insert into order_items
            (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot,
             variant_label_snapshot, supplier_id, quantity, unit_price_snapshot, locked)
            values ('oi_1', 'ord_accept_test', 'P-1', 'Balo', 'SKU-BALO', 'Đỏ', 'sup_1', 2, 500000, 0)""")
    )
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining,
             expires_at, published_by)
            values ('qv_1', 'ord_accept_test', 1, 'published', 1000000, 900000, 270000, 630000,
                    '2030-01-01 00:00:00', 'admin_1')""")
    )
    await canonical_db_session.commit()

    # Customer accepts quote
    res = await save_order(
        canonical_db_session,
        actor_id="cust_1",
        expected_updated_at="2026-08-18T10:00:00",
        order={
            "id": "ord_accept_test",
            "commercialStatus": "customer_accepted",
            "acceptedQuoteId": "qv_1",
            "acceptedQuoteVersion": 1,
        },
    )

    # Verify quote state is accepted
    qv = (
        await canonical_db_session.execute(
            text("select status, accepted_by from quote_versions where id = 'qv_1'")
        )
    ).mappings().one()
    assert qv["status"] == "accepted"
    assert qv["accepted_by"] == "cust_1"

    # Verify items are locked
    oi_locked = (
        await canonical_db_session.execute(
            text("select locked from order_items where id = 'oi_1'")
        )
    ).scalar_one()
    assert oi_locked == 1 or oi_locked is True

    # Verify order state
    co = (
        await canonical_db_session.execute(
            text("select commercial_status, payment_status, current_quote_version from customer_orders where id = 'ord_accept_test'")
        )
    ).mappings().one()
    assert co["commercial_status"] == "customer_accepted"
    assert co["payment_status"] == "deposit_requested"
    assert co["current_quote_version"] == 1

    # Verify server-derived payment request exists
    pr = (
        await canonical_db_session.execute(
            text("select amount, purpose, status from payment_requests where order_id = 'ord_accept_test'")
        )
    ).mappings().one()
    assert pr["amount"] == 270000
    assert pr["purpose"] == "deposit"
    assert pr["status"] == "active"


@pytest.mark.asyncio
async def test_customer_accept_stale_or_expired_quote_is_rejected(canonical_db_session):
    """Accepting an expired quote must fail closed."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_cust_2', 'Đại lý 2')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('cust_2', 'org_cust_2', 'Khách', 'cust2@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_expired_test', 'PTW-2026-002', 'org_cust_2', 'cust_2', 'quoted', 'unrequested',
                    'deposit_cod', 1, '2026-08-18 10:00:00')""")
    )
    # Expired quote
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining,
             expires_at, published_by)
            values ('qv_expired', 'ord_expired_test', 1, 'published', 1000000, 1000000, 300000, 700000,
                    '2020-01-01 00:00:00', 'cust_2')""")
    )
    await canonical_db_session.commit()

    with pytest.raises(ValueError, match="hết hạn|QUOTE_EXPIRED"):
        await save_order(
            canonical_db_session,
            actor_id="cust_2",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_expired_test",
                "commercialStatus": "customer_accepted",
                "acceptedQuoteId": "qv_expired",
                "acceptedQuoteVersion": 1,
            },
        )


@pytest.mark.asyncio
async def test_monotonic_realtime_sync_revision(canonical_db_session):
    """Ensure order mutations advance monotonic revision counters."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_sync_1', 'Đại lý Sync')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('user_sync_1', 'org_sync_1', 'User Sync', 'sync@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into suppliers (id, code, name, active) values ('sup_sync', 'SUP-S', 'NCC', 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into products (id, code, name, brand, category, active)
            values ('prod_s', 'PT-S', 'Túi Sync', 'Pet Travel', 'Túi', 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into product_variants (id, product_id, sku, label, active)
            values ('var_s', 'prod_s', 'SKU-S', 'Đen', 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into supplier_offers
            (id, supplier_id, product_variant_id, wholesale_price, min_order_qty, stock_qty, active)
            values ('offer_s', 'sup_sync', 'var_s', 200000, 1, 50, 1)""")
    )
    await canonical_db_session.commit()

    rev_before = await get_orders_revision(canonical_db_session, actor_id="user_sync_1", is_admin=False)

    await save_order(
        canonical_db_session,
        actor_id="user_sync_1",
        order={
            "id": "ord_sync_1",
            "items": [{"variantSku": "SKU-S", "supplierId": "sup_sync", "quantity": 1}],
            "paymentIntent": "deposit_cod",
        },
    )

    rev_after = await get_orders_revision(canonical_db_session, actor_id="user_sync_1", is_admin=False)
    assert rev_after != rev_before


def test_pricing_engine_integer_vnd_and_adjustments():
    """Verify zero floating-point drift in canonical pricing engine."""
    items = [
        {"quantity": 10, "unitPriceSnapshot": 166500},
        {"quantity": 5, "unitPriceSnapshot": 250000},
    ]
    adjustments = [
        {"type": "discount", "amount": 100000},
        {"type": "shipping_fee", "amount": 50000},
    ]
    # Subtotal: 10*166500 + 5*250000 = 1665000 + 1250000 = 2915000
    # Adjustments: -100000 + 50000 = -50000
    # Final Total: 2865000
    # Deposit (30% = 3000 bps): 2865000 * 3000 // 10000 = 859500
    # COD remaining: 2865000 - 859500 = 2005500
    res = calculate_quote_financials(
        items=items,
        adjustments=adjustments,
        payment_intent="deposit_cod",
        deposit_rate_bps=3000,
    )
    assert res["subtotal"] == 2915000
    assert res["adjustmentTotal"] == -50000
    assert res["finalTotal"] == 2865000
    assert res["depositAmount"] == 859500
    assert res["codRemaining"] == 2005500
    assert res["depositAmount"] + res["codRemaining"] == res["finalTotal"]


def test_stock_command_transition_mapping():
    """Verify ADR-017 transition mappings."""
    assert stock_command_for_transition(
        before_commercial="quoted",
        after_commercial="customer_accepted",
        before_fulfillment="not_started",
        after_fulfillment="not_started",
    ) == "reserve_order"

    assert stock_command_for_transition(
        before_commercial="customer_accepted",
        after_commercial="cancelled",
        before_fulfillment="supplier_confirmed",
        after_fulfillment="supplier_confirmed",
    ) == "cancel_order"

    assert stock_command_for_transition(
        before_commercial="locked",
        after_commercial="locked",
        before_fulfillment="ready_to_ship",
        after_fulfillment="shipped",
    ) == "consume_order"
