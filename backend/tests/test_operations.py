import pytest
from datetime import datetime, timezone
from sqlalchemy import text
from app.models.wholesale import Product, ProductVariant, Supplier
from app.routers.v1.endpoints.operations import (
    _calculate_inventory_transition,
    _require_actor_permission,
    OperationsDocumentInput,
    check_sku_availability,
    create_operations_document,
    get_operations_overview,
)
from fastapi import HTTPException


def test_inventory_transition_uses_weighted_average_and_protects_available_stock():
    next_on_hand, next_defective, next_avg_cost = _calculate_inventory_transition(
        sku="SKU-AVG",
        current_on_hand=10,
        current_reserved=0,
        current_defective=0,
        current_avg_cost=100,
        quantity_delta=10,
        defective_delta=0,
        unit_cost=200,
    )
    assert (next_on_hand, next_defective, next_avg_cost) == (20, 0, 150)

    outbound = _calculate_inventory_transition(
        sku="SKU-OUT",
        current_on_hand=20,
        current_reserved=0,
        current_defective=0,
        current_avg_cost=150,
        quantity_delta=-5,
        defective_delta=0,
        unit_cost=0,
    )
    assert outbound == (15, 0, 150), "Outbound stock must not revalue the remaining inventory"

    with pytest.raises(HTTPException) as sale_error:
        _calculate_inventory_transition(
            sku="SKU-LIMIT",
            current_on_hand=10,
            current_reserved=4,
            current_defective=3,
            current_avg_cost=100,
            quantity_delta=-4,
            defective_delta=0,
            unit_cost=100,
        )
    assert sale_error.value.status_code == 409

    with pytest.raises(HTTPException) as defect_error:
        _calculate_inventory_transition(
            sku="SKU-DEFECT",
            current_on_hand=5,
            current_reserved=2,
            current_defective=2,
            current_avg_cost=100,
            quantity_delta=0,
            defective_delta=2,
            unit_cost=0,
        )
    assert defect_error.value.status_code == 409


def test_operations_posting_source_locks_inventory_rows():
    from pathlib import Path

    source = (Path(__file__).resolve().parents[1] / "app" / "routers" / "v1" / "endpoints" / "operations.py").read_text(
        encoding="utf-8"
    )
    assert "FOR UPDATE" in source
    assert "ON CONFLICT (organization_id, warehouse_id, sku) DO NOTHING" in source


def test_operations_document_input_rejects_fractional_money_and_unknown_fields():
    from pydantic import ValidationError

    base = {
        "type": "purchase_receipt",
        "lines": [{"sku": "SKU-1", "quantity": 1, "unitCostVnd": 100}],
        "userId": "warehouse_1",
        "organizationId": "org_1",
    }
    with pytest.raises(ValidationError):
        OperationsDocumentInput.model_validate(
            {**base, "lines": [{"sku": "SKU-1", "quantity": 1, "unitCostVnd": 100.5}]}
        )
    with pytest.raises(ValidationError):
        OperationsDocumentInput.model_validate({**base, "unexpectedPrivilege": True})
    with pytest.raises(ValidationError):
        OperationsDocumentInput.model_validate({**base, "shouldPost": "false"})

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
