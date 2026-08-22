import secrets

from fastapi import HTTPException, Request, status

from app.core.config import settings


PUBLIC_API_PATHS = {
    "/api/v1/health",
    "/api/v1/categories",
    "/api/v1/products",
    "/api/v1/orders/webhook/vietqr",
}


def is_public_api_path(path: str, method: str = "GET") -> bool:
    normalized_path = path.rstrip("/") or "/"
    if normalized_path in {"/api/v1/products", "/api/v1/categories"} and method.upper() not in {"GET", "HEAD"}:
        return False
    if normalized_path == "/api/v1/orders/webhook/vietqr" and method.upper() != "POST":
        return False
    return normalized_path in PUBLIC_API_PATHS


def get_internal_secret() -> str:
    return settings.BACKEND_INTERNAL_SECRET.strip()


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
