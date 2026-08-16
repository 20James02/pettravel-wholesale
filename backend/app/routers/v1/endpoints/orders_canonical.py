from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.repositories.orders import OrderConflictError
from app.repositories.order_read import (
    get_orders_revision,
    list_orders as read_orders,
    list_orders_summary,
)
from app.repositories.orders import save_order as write_order


router = APIRouter()


@router.get("/revision", response_model=Dict[str, str])
async def get_revision(
    user_id: str,
    is_admin: bool = False,
    db: AsyncSession = Depends(get_db),
):
    revision = await get_orders_revision(db, actor_id=user_id, is_admin=is_admin)
    return {"revision": revision}


@router.get("/summary", response_model=Dict[str, Any])
async def get_orders_summary(
    user_id: str,
    is_admin: bool = False,
    limit: int = 25,
    cursor_updated_at: str | None = None,
    cursor_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await list_orders_summary(
        db,
        actor_id=user_id,
        is_admin=is_admin,
        limit=min(100, max(1, limit)),
        cursor_updated_at=cursor_updated_at,
        cursor_id=cursor_id,
    )


@router.get("/list", response_model=List[Dict[str, Any]])
async def list_orders(
    user_id: str,
    is_admin: bool = False,
    db: AsyncSession = Depends(get_db),
):
    return await read_orders(db, actor_id=user_id, is_admin=is_admin)


@router.post("/save", response_model=Dict[str, Any])
async def save_order(
    payload: Dict[str, Any],
    creator_id: str,
    db: AsyncSession = Depends(get_db),
):
    order = payload.get("order")
    if not isinstance(order, dict):
        raise HTTPException(status_code=400, detail="Thiếu dữ liệu đơn hàng.")
    try:
        result = await write_order(
            db,
            actor_id=creator_id,
            order=order,
            expected_updated_at=payload.get("expectedUpdatedAt"),
        )
        return {"status": "success", **result}
    except OrderConflictError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
