from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, timezone
from app.core.db import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.config import settings
from app.repositories.identity import get_user_by_email, get_user_by_email_or_phone
from app.schemas.wholesale import UserCreate, UserResponse
from app.services.auth_rate_limit import consume_login_rate_limit, reset_login_rate_limit
from pydantic import BaseModel, Field
import uuid

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

class LoginJsonInput(BaseModel):
    identifier: str | None = Field(default=None, max_length=180)
    email: str | None = Field(default=None, max_length=180)
    password: str = Field(min_length=8, max_length=128)

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    existing_user = await get_user_by_email(db, user_in.email)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Tài khoản email này đã được sử dụng."
        )
    
    # Public registration is currently disabled by the BFF. Keep this endpoint
    # least-privileged in case it is called directly in a non-production setup.
    from sqlalchemy import text

    user_id = f"u_{uuid.uuid4().hex[:12]}"
    await db.execute(
        text("""insert into app_users
            (id, email, password_hash, full_name, phone, status)
            values (:id, :email, :password_hash, :full_name, :phone, 'active')"""),
        {
            "id": user_id,
            "email": str(user_in.email).strip().lower(),
            "password_hash": get_password_hash(user_in.password),
            "full_name": user_in.name,
            "phone": user_in.phone,
        },
    )
    await db.execute(
        text("""insert into user_roles (user_id, role_id)
            select :user_id, id from roles where key = 'customer_owner'"""),
        {"user_id": user_id},
    )
    return {
        "id": user_id,
        "email": str(user_in.email).strip().lower(),
        "name": user_in.name,
        "phone": user_in.phone,
        "role": "customer_owner",
        "company": None,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    rate_limit = await consume_login_rate_limit(db, form_data.username)
    if not rate_limit.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi rồi thử lại.",
            headers={"Retry-After": str(rate_limit.retry_after_seconds)},
        )
    user = await get_user_by_email_or_phone(db, form_data.username)
    if not user or not verify_password(form_data.password, user.get("password_hash") or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sai thông tin đăng nhập (email / số điện thoại) hoặc mật khẩu.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản chưa được kích hoạt hoặc đã bị vô hiệu hóa.",
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user["id"], expires_delta=access_token_expires
    )
    await reset_login_rate_limit(db, form_data.username)
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login-json")
async def login_json(payload: LoginJsonInput, db: AsyncSession = Depends(get_db)):
    identifier = (payload.identifier or payload.email or "").strip()
    if not identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng cung cấp email hoặc số điện thoại đăng nhập."
        )
    rate_limit = await consume_login_rate_limit(db, identifier)
    if not rate_limit.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi rồi thử lại.",
            headers={"Retry-After": str(rate_limit.retry_after_seconds)},
        )
    user = await get_user_by_email_or_phone(db, identifier)
    if not user or not verify_password(payload.password, user.get("password_hash") or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sai thông tin đăng nhập (email / số điện thoại) hoặc mật khẩu."
        )
    
    if user["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản chưa được kích hoạt hoặc đã bị vô hiệu hóa.",
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user["id"], expires_delta=access_token_expires
    )
    await reset_login_rate_limit(db, identifier)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "name": user["full_name"],
            "email": user["email"],
            "phone": user.get("phone") or "",
            "role": user["role"],
            "company": user.get("company") or "",
            "organizationId": user.get("organization_id"),
        }
    }
