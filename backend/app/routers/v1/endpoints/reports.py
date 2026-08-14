from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.repositories.reports import get_reports_overview as read_reports_overview


router = APIRouter()


@router.get("/overview", response_model=dict[str, Any])
async def get_reports_overview(
    org_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if not org_id:
        raise HTTPException(status_code=400, detail="Thiếu organizationId cho báo cáo nội bộ.")
    return await read_reports_overview(db, organization_id=org_id)
