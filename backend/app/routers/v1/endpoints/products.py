from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.repositories.catalog import (
    CatalogError,
    deactivate_product,
    list_products,
    save_product_record,
)


router = APIRouter()


@router.get("/", response_model=List[Dict[str, Any]])
async def get_products(role: str = "guest", db: AsyncSession = Depends(get_db)):
    if role not in {"guest", "customer", "admin"}:
        raise HTTPException(status_code=400, detail="Vai trò danh mục không hợp lệ.")
    return await list_products(db, role)


@router.post("/", response_model=Dict[str, Any])
async def save_product(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    try:
        product_id = await save_product_record(db, payload)
        await db.commit()
    except CatalogError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "status": "success",
        "productId": product_id,
        "message": "Lưu sản phẩm thành công.",
    }


@router.delete("/{code}", response_model=Dict[str, Any])
async def delete_product(code: str, db: AsyncSession = Depends(get_db)):
    if not await deactivate_product(db, code):
        raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm.")
    await db.commit()
    return {"status": "success", "message": "Đã ngừng hiển thị sản phẩm."}
