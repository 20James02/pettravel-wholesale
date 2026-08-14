from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, timezone
from app.core.db import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.config import settings
from app.repositories.identity import get_user_by_email
from app.schemas.wholesale import UserCreate, UserResponse
from pydantic import BaseModel
import uuid

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

class LoginJsonInput(BaseModel):
    email: str
    password: str

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
    user = await get_user_by_email(db, form_data.username)
    if not user or not verify_password(form_data.password, user.get("password_hash") or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sai email hoặc mật khẩu đăng nhập.",
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
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login-json")
async def login_json(payload: LoginJsonInput, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.get("password_hash") or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sai email hoặc mật khẩu đăng nhập."
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
