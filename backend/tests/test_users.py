import pytest
from sqlalchemy import text

from app.routers.v1.endpoints.users import get_role_permissions, get_user_by_id


@pytest.mark.asyncio
async def test_get_user_by_id_returns_tenant_and_database_permissions(canonical_db_session):
    await canonical_db_session.execute(
        text("insert into organizations (id, name) values ('org_1', 'Đại lý 1')")
    )
    await canonical_db_session.execute(
        text("""insert into app_users
            (id, organization_id, full_name, email, status)
            values ('user_1', 'org_1', 'Chủ đại lý', 'owner@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("insert into user_roles (user_id, role_id) values ('user_1', 'role_customer')")
    )
    await canonical_db_session.execute(
        text("insert into permissions (key, description) values ('order.read', 'Read orders')")
    )
    await canonical_db_session.execute(
        text("""insert into role_permissions (role_id, permission_key)
            values ('role_customer', 'order.read')""")
    )
    await canonical_db_session.commit()

    result = await get_user_by_id("user_1", canonical_db_session)

    assert result["organizationId"] == "org_1"
    assert result["company"] == "Đại lý 1"
    assert result["role"] == "customer_owner"
    assert result["permissions"] == ["order.read"]


@pytest.mark.asyncio
async def test_role_permissions_are_loaded_from_database(canonical_db_session):
    await canonical_db_session.execute(
        text("insert into permissions (key, description) values ('catalog.read', 'Read catalog')")
    )
    await canonical_db_session.execute(
        text("""insert into role_permissions (role_id, permission_key)
            values ('role_customer', 'catalog.read')""")
    )
    await canonical_db_session.commit()

    result = await get_role_permissions(canonical_db_session)

    assert result["customer_owner"] == ["catalog.read"]
    assert result["super_admin"] == []
