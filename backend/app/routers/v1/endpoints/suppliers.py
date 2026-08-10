from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Dict, Any
from app.core.db import get_db
from app.models.wholesale import Supplier
import uuid

router = APIRouter()

@router.get("/", response_model=List[Dict[str, Any]])
async def get_suppliers(db: AsyncSession = Depends(get_db)):
    """
    Truy xuất danh sách nhà cung cấp.
    """
    result = await db.execute(select(Supplier))
    suppliers = result.scalars().all()
    return [
        {
            "id": s.id,
            "code": s.code,
            "name": s.name,
            "leadTimeDays": s.lead_time_days,
            "isAdminOnly": s.is_admin_only
        }
        for s in suppliers
    ]

@router.post("/", response_model=Dict[str, Any])
async def save_supplier(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Thêm mới hoặc cập nhật một nhà cung cấp.
    """
    id_ = payload.get("id")
    if id_:
        result = await db.execute(select(Supplier).filter(Supplier.id == id_))
        db_supplier = result.scalars().first()
    else:
        db_supplier = None
        
    if not db_supplier:
        db_supplier = Supplier(
            id=id_ or f"sup_{uuid.uuid4().hex[:12]}",
            code=payload["code"],
            name=payload["name"],
            lead_time_days=payload.get("leadTimeDays", 3),
            is_admin_only=payload.get("isAdminOnly", False)
        )
        db.add(db_supplier)
    else:
        db_supplier.code = payload.get("code", db_supplier.code)
        db_supplier.name = payload.get("name", db_supplier.name)
        db_supplier.lead_time_days = payload.get("leadTimeDays", db_supplier.lead_time_days)
        db_supplier.is_admin_only = payload.get("isAdminOnly", db_supplier.is_admin_only)
        
    await db.commit()
    return {"status": "success", "message": "Lưu nhà cung cấp thành công."}

@router.delete("/{id}", response_model=Dict[str, Any])
async def delete_supplier(id: str, db: AsyncSession = Depends(get_db)):
    """
    Xóa một nhà cung cấp.
    """
    result = await db.execute(select(Supplier).filter(Supplier.id == id))
    supplier = result.scalars().first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhà cung cấp.")
    await db.delete(supplier)
    await db.commit()
    return {"status": "success", "message": "Xóa nhà cung cấp thành công."}
