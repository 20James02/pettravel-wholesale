import pytest

from app.routers.v1.endpoints.suppliers import get_suppliers, save_supplier


@pytest.mark.asyncio
async def test_supplier_endpoint_uses_canonical_admin_only_column(canonical_db_session):
    await save_supplier(
        {"id": "sup_1", "code": "SUP-1", "name": "Nhà cung cấp", "leadTimeDays": 4, "adminOnly": True},
        canonical_db_session,
    )

    assert await get_suppliers(canonical_db_session) == [
        {"id": "sup_1", "code": "SUP-1", "name": "Nhà cung cấp", "leadTimeDays": 4, "adminOnly": True}
    ]
