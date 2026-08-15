import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from typing import Any, Union
import bcrypt
from passlib.exc import PasswordValueError, UnknownHashError
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    try:
        if hashed_password.startswith(("$2b$", "$2a$", "$2y$")):
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(
    subject: Union[str, Any], expires_delta: timedelta = None
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    header = _base64url_encode(
        json.dumps({"alg": ALGORITHM, "typ": "JWT"}, separators=(",", ":")).encode("utf-8")
    )
    payload = _base64url_encode(
        json.dumps(
            {"exp": int(expire.timestamp()), "sub": str(subject)},
            separators=(",", ":"),
        ).encode("utf-8")
    )
    signing_input = f"{header}.{payload}"
    signature = hmac.new(
        settings.jwt_secret.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_base64url_encode(signature)}"
