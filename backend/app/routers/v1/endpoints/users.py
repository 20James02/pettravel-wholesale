from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Dict, Any
from app.core.db import get_db
from app.models.wholesale import User
from app.core.security import get_password_hash
import uuid

router = APIRouter()

@router.get("/", response_model=List[Dict[str, Any]])
async def get_app_users(db: AsyncSession = Depends(get_db)):
    """
    Truy xuất danh sách tất cả tài khoản trong hệ thống.
    """
    result = await db.execute(select(User))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "fullName": u.name,
            "phone": u.phone or "",
            "role": u.role,
            "company": u.company or "",
            "createdAt": u.created_at.isoformat() if u.created_at else None
        }
        for u in users
    ]

@router.post("/", response_model=Dict[str, Any])
async def create_app_user(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Tạo một tài khoản người dùng mới.
    """
    email = payload.get("email")
    password = payload.get("password")
    
    result = await db.execute(select(User).filter(User.email == email))
    existing = result.scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="Tài khoản email đã được sử dụng.")
        
    db_user = User(
        id=payload.get("id") or f"u_{uuid.uuid4().hex[:12]}",
        email=email,
        hashed_password=get_password_hash(password) if password else "...",
        name=payload.get("fullName", ""),
        phone=payload.get("phone", ""),
        role=payload.get("role", "customer_owner"),
        company=payload.get("company", "")
    )
    db.add(db_user)
    await db.commit()
    return {"status": "success", "message": "Tạo tài khoản thành công."}

@router.put("/profile", response_model=Dict[str, Any])
async def update_user_profile(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Cập nhật thông tin hồ sơ của tài khoản.
    """
    user_id = payload.get("id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Thiếu user id.")
        
    result = await db.execute(select(User).filter(User.id == user_id))
    db_user = result.scalars().first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")
        
    db_user.name = payload.get("fullName", db_user.name)
    db_user.phone = payload.get("phone", db_user.phone)
    if "role" in payload:
        db_user.role = payload["role"]
    if "company" in payload:
        db_user.company = payload["company"]
        
    await db.commit()
    return {"status": "success", "message": "Cập nhật hồ sơ thành công."}
