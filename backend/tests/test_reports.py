import pytest
from sqlalchemy import text

from app.repositories.reports import get_reports_overview


@pytest.mark.asyncio
async def test_reports_use_canonical_orders_and_match_frontend_contract(canonical_db_session):
    await canonical_db_session.execute(
        text("insert into organizations (id, name) values ('org_customer', 'Đại lý'), ('org_internal', 'Pet Travel')")
    )
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('customer_1', 'org_customer', 'Khách', 'customer@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("insert into suppliers (id, code, name, active) values ('sup_1', 'SUP-1', 'Nhà cung cấp', 1)")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, fulfillment_status,
             payment_intent, invoice_requested)
            values ('order_1', 'PTW-1', 'org_customer', 'customer_1', 'locked', 'packing', 'deposit_cod', 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            values ('quote_1', 'order_1', 1, 'published', 120000, 100000, 30000, 70000, '2030-01-01')""")
    )
    await canonical_db_session.execute(
        text("""insert into order_items
            (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot,
             variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
            values ('item_1', 'order_1', 'PT-1', 'Túi', 'SKU-1', 'Xanh', 'sup_1', 2, 60000)""")
    )
    await canonical_db_session.execute(
        text("""insert into inventory_balances
            (id, organization_id, sku, on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd)
            values ('balance_1', 'org_internal', 'SKU-1', 10, 2, 1, 40000)""")
    )
    await canonical_db_session.commit()

    report = await get_reports_overview(canonical_db_session, organization_id="org_internal")

    assert report["basis"] == "mixed_operational_estimate"
    assert report["kpis"]["totalOrders"] == 1
    assert report["kpis"]["estimatedSalesVnd"] == 100000
    assert report["kpis"]["availableQty"] == 7
    assert report["salesBySupplier"][0]["label"] == "Nhà cung cấp"
