import pytest
from sqlalchemy.future import select

from app.models.wholesale import AppSetting
from app.routers.v1.endpoints.health import check_database_read_write


@pytest.mark.asyncio
async def test_database_healthcheck_reads_and_writes(db_session):
    result = await check_database_read_write(db_session)

    assert result["ok"] is True
    assert result["read"] is True
    assert result["write"] is True
    assert result["key"] == "__healthcheck_db__"

    stored = await db_session.execute(
        select(AppSetting).filter(AppSetting.key == "__healthcheck_db__")
    )
    setting = stored.scalars().first()
    assert setting is not None
    assert setting.value["purpose"] == "database_read_write_healthcheck"
