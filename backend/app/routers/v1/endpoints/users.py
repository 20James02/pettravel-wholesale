import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_password_hash
from app.repositories.identity import (
    get_user_by_email,
    get_user_by_id as find_user_by_id,
    get_user_permissions,
    list_role_permissions,
    list_users,
)


router = APIRouter()


def _user_response(user: dict[str, Any], permissions: list[str] | None = None) -> dict[str, Any]:
    created_at = user.get("created_at")
    response = {
        "id": user["id"],
        "email": user["email"],
        "fullName": user["full_name"],
        "name": user["full_name"],
        "phone": user.get("phone") or "",
        "avatarUrl": user.get("avatar_url") or "",
        "role": user["role"],
        "company": user.get("company") or "",
        "organizationId": user.get("organization_id"),
        "status": user["status"],
        "createdAt": created_at.isoformat() if hasattr(created_at, "isoformat") else created_at,
    }
    if permissions is not None:
        response["permissions"] = permissions
    return response


@router.get("/", response_model=List[Dict[str, Any]])
async def get_app_users(db: AsyncSession = Depends(get_db)):
    return [_user_response(user) for user in await list_users(db)]


@router.post("/", response_model=Dict[str, Any])
async def create_app_user(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    full_name = str(payload.get("fullName") or "").strip()
    role_key = str(payload.get("role") or "customer_owner")
    if not email or not full_name or len(password) < 12:
        raise HTTPException(status_code=400, detail="Email, họ tên và mật khẩu tối thiểu 12 ký tự là bắt buộc.")
    if await get_user_by_email(db, email):
        raise HTTPException(status_code=409, detail="Tài khoản email đã được sử dụng.")

    role = (
        await db.execute(text("select id from roles where key = :role_key"), {"role_key": role_key})
    ).mappings().first()
    if not role:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ.")

    organization_id = None
    company = str(payload.get("company") or "").strip()
    if company:
        organization = (
            await db.execute(
                text("select id from organizations where lower(name) = lower(:name) limit 1"),
                {"name": company},
            )
        ).mappings().first()
        organization_id = str(organization["id"]) if organization else f"org_{uuid.uuid4().hex}"
        if not organization:
            await db.execute(
                text("insert into organizations (id, name) values (:id, :name)"),
                {"id": organization_id, "name": company},
            )

    user_id = str(payload.get("id") or f"u_{uuid.uuid4().hex}")
    await db.execute(
        text("""insert into app_users
            (id, organization_id, email, password_hash, full_name, phone, status)
            values (:id, :organization_id, :email, :password_hash, :full_name, :phone, 'active')"""),
        {
            "id": user_id,
            "organization_id": organization_id,
            "email": email,
            "password_hash": get_password_hash(password),
            "full_name": full_name,
            "phone": payload.get("phone") or None,
        },
    )
    await db.execute(
        text("insert into user_roles (user_id, role_id) values (:user_id, :role_id)"),
        {"user_id": user_id, "role_id": role["id"]},
    )
    await db.commit()
    return {"status": "success", "userId": user_id, "message": "Tạo tài khoản thành công."}


@router.put("/profile", response_model=Dict[str, Any])
async def update_user_profile(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    user_id = str(payload.get("id") or "")
    user = await find_user_by_id(db, user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")

    await db.execute(
        text("""update app_users set
            full_name = :full_name,
            phone = :phone,
            avatar_url = :avatar_url,
            password_hash = :password_hash
            where id = :id"""),
        {
            "id": user_id,
            "full_name": payload.get("fullName") or user["full_name"],
            "phone": payload.get("phone") if payload.get("phone") is not None else user.get("phone"),
            "avatar_url": payload.get("avatarUrl") if payload.get("avatarUrl") is not None else user.get("avatar_url"),
            "password_hash": (
                get_password_hash(str(payload["password"]))
                if payload.get("password")
                else user.get("password_hash")
            ),
        },
    )
    await db.commit()
    return {"status": "success", "message": "Cập nhật hồ sơ thành công."}


@router.get("/role-permissions", response_model=Dict[str, List[str]])
async def get_role_permissions(db: AsyncSession = Depends(get_db)):
    return await list_role_permissions(db)


@router.get("/by-id/{user_id}", response_model=Dict[str, Any])
async def get_user_by_id(user_id: str, db: AsyncSession = Depends(get_db)):
    user = await find_user_by_id(db, user_id)
    if not user or user["status"] != "active":
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản đang hoạt động.")
    permissions = await get_user_permissions(db, user_id)
    return _user_response(user, permissions)
