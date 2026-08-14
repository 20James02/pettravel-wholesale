import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db


router = APIRouter()


@router.get("/", response_model=List[Dict[str, Any]])
async def get_suppliers(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            text("""select id, code, name, lead_time_days, admin_only
                from suppliers where active = true order by code""")
        )
    ).mappings().all()
    return [
        {
            "id": row["id"],
            "code": row["code"],
            "name": row["name"],
            "leadTimeDays": int(row["lead_time_days"]),
            "adminOnly": bool(row["admin_only"]),
        }
        for row in rows
    ]


@router.post("/", response_model=Dict[str, Any])
async def save_supplier(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    code = str(payload.get("code") or "").strip()
    name = str(payload.get("name") or "").strip()
    if not code or not name:
        raise HTTPException(status_code=400, detail="Mã và tên nhà cung cấp là bắt buộc.")
    supplier_id = str(payload.get("id") or f"sup_{uuid.uuid4().hex}")
    existing = (
        await db.execute(
            text("select id from suppliers where id = :id or code = :code limit 1"),
            {"id": supplier_id, "code": code},
        )
    ).mappings().first()
    values = {
        "id": str(existing["id"]) if existing else supplier_id,
        "code": code,
        "name": name,
        "lead_time_days": max(0, int(payload.get("leadTimeDays") or 1)),
        "admin_only": bool(payload.get("adminOnly", True)),
    }
    if existing:
        await db.execute(
            text("""update suppliers set code = :code, name = :name,
                lead_time_days = :lead_time_days, admin_only = :admin_only,
                active = true where id = :id"""),
            values,
        )
    else:
        await db.execute(
            text("""insert into suppliers
                (id, code, name, lead_time_days, admin_only, active)
                values (:id, :code, :name, :lead_time_days, :admin_only, true)"""),
            values,
        )
    await db.commit()
    return {"status": "success", "supplierId": values["id"], "message": "Lưu nhà cung cấp thành công."}


@router.delete("/{supplier_id}", response_model=Dict[str, Any])
async def delete_supplier(supplier_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("update suppliers set active = false where id = :id"),
        {"id": supplier_id},
    )
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhà cung cấp.")
    await db.commit()
    return {"status": "success", "message": "Đã ngừng sử dụng nhà cung cấp."}
