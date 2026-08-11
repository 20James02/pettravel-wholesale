import secrets

from fastapi import HTTPException, Request, status

from app.core.config import settings


PUBLIC_API_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/login-json",
}


def is_public_api_path(path: str) -> bool:
    return path in PUBLIC_API_PATHS


def get_internal_secret() -> str:
    return (
        settings.BACKEND_INTERNAL_SECRET
        or settings.SUPABASE_JWT_SECRET
        or settings.JWT_SECRET
        or ""
    ).strip()


def require_internal_request(request: Request) -> None:
    secret = get_internal_secret()
    if not secret:
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Backend internal authentication is not configured.",
            )
        return

    provided = request.headers.get("x-backend-internal-secret", "").strip()
    if not secrets.compare_digest(provided, secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Backend internal authentication failed.",
        )
