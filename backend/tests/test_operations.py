import pytest
from datetime import datetime, timezone
from sqlalchemy import text
from app.models.wholesale import Product, ProductVariant, Supplier
from app.routers.v1.endpoints.operations import (
    _require_actor_permission,
    check_sku_availability,
    create_operations_document,
    get_operations_overview,
)
from fastapi import HTTPException

@pytest.mark.asyncio
async def test_operations_endpoints(db_session):
    # Setup initial mock entities
    supplier = Supplier(id="sup_op_test", code="OPSUP", name="Op Supplier")
    db_session.add(supplier)
    
    product = Product(code="POP", name="Product Op", category="Food")
    db_session.add(product)
    
    variant = ProductVariant(
        sku="POP-V1",
        product_code="POP",
        label="Size L",
        wholesale_price=200000,
        min_order_qty=2,
        stock=50,
        supplier_id="sup_op_test"
    )
    db_session.add(variant)
    await db_session.commit()

    # Create tables for warehouses and inventory_balances if not present, and insert mock data using raw SQL
    await db_session.execute(text("""
        CREATE TABLE IF NOT EXISTS warehouses (
            id TEXT PRIMARY KEY,
            organization_id TEXT,
            code TEXT,
            name TEXT,
            is_default BOOLEAN,
            active BOOLEAN
        )
    """))
    await db_session.execute(text("""
        CREATE TABLE IF NOT EXISTS inventory_balances (
            id TEXT PRIMARY KEY,
            organization_id TEXT,
            warehouse_id TEXT,
            product_variant_id TEXT,
            sku TEXT,
            supplier_id TEXT,
            on_hand_qty INTEGER,
            reserved_qty INTEGER,
            defective_qty INTEGER,
            avg_cost_vnd INTEGER,
            updated_at TIMESTAMP
        )
    """))
    await db_session.execute(text("""
        CREATE TABLE IF NOT EXISTS operations_documents (
            id TEXT PRIMARY KEY,
            organization_id TEXT,
            type TEXT,
            document_no TEXT,
            status TEXT,
            partner_name TEXT,
            total_amount INTEGER,
            note TEXT,
            created_by TEXT,
            posted_by TEXT,
            posted_at TIMESTAMP,
            created_at TIMESTAMP
        )
    """))
    
    await db_session.execute(text("""
        INSERT INTO warehouses (id, organization_id, code, name, is_default, active)
        VALUES ('wh_op_test', 'org_op_test', 'MAIN', 'Kho chính Pet Travel', true, true)
    """))
    
    await db_session.execute(text("""
        INSERT INTO inventory_balances (id, organization_id, warehouse_id, product_variant_id, sku, supplier_id, on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd, updated_at)
        VALUES ('bal_op_test', 'org_op_test', 'wh_op_test', 'POP-V1', 'POP-V1', 'sup_op_test', 50, 10, 5, 150000, :updated)
    """), {"updated": datetime.now(timezone.utc)})
    await db_session.commit()
    
    # Test availability
    avail = await check_sku_availability("POP-V1", db_session)
    assert avail["sku"] == "POP-V1"
    
    # Test overview
    overview = await get_operations_overview("org_op_test", db_session)
    assert overview["inventory"]["onHandQty"] == 50
    assert overview["inventory"]["reservedQty"] == 10
    assert overview["inventory"]["defectiveQty"] == 5
    assert overview["inventory"]["availableQty"] == 35 # 50 - 10 - 5
    assert overview["inventory"]["inventoryValueVnd"] == 50 * 150000


@pytest.mark.asyncio
async def test_operations_actor_cannot_cross_organization(canonical_db_session):
    await canonical_db_session.execute(
        text("insert into organizations (id, name) values ('org_1', 'Pet Travel'), ('org_2', 'Khác')")
    )
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('warehouse_1', 'org_1', 'Kho', 'warehouse@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("insert into user_roles (user_id, role_id) values ('warehouse_1', 'role_admin')")
    )
    await canonical_db_session.execute(
        text("insert into permissions (key, description) values ('operations.write', 'Write operations')")
    )
    await canonical_db_session.execute(
        text("insert into role_permissions (role_id, permission_key) values ('role_admin', 'operations.write')")
    )
    await canonical_db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await _require_actor_permission(
            canonical_db_session,
            actor_id="warehouse_1",
            permission="operations.write",
            organization_id="org_2",
        )

    assert exc.value.status_code == 403
