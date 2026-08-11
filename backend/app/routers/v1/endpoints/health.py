from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.db import get_db
from app.models.wholesale import AppSetting


router = APIRouter()

DB_HEALTH_KEY = "__healthcheck_db__"


@router.get("/db", response_model=Dict[str, Any])
async def check_database_read_write(db: AsyncSession = Depends(get_db)):
    checked_at = datetime.now(timezone.utc).isoformat()

    read_result = await db.execute(
        select(AppSetting).filter(AppSetting.key == DB_HEALTH_KEY)
    )
    existing = read_result.scalars().first()

    payload = {
        "checkedAt": checked_at,
        "purpose": "database_read_write_healthcheck",
    }

    if existing:
        existing.value = payload
        operation = "update"
    else:
        db.add(AppSetting(key=DB_HEALTH_KEY, value=payload))
        operation = "insert"

    await db.flush()

    verify_result = await db.execute(
        select(AppSetting).filter(AppSetting.key == DB_HEALTH_KEY)
    )
    verified = verify_result.scalars().first()

    return {
        "ok": bool(verified and verified.value.get("checkedAt") == checked_at),
        "read": True,
        "write": True,
        "operation": operation,
        "key": DB_HEALTH_KEY,
        "checkedAt": checked_at,
    }
