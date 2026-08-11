from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routers.router import api_router
from app.core.config import settings
from app.core.internal_auth import is_public_api_path, require_internal_request
import uvicorn

settings.validate_production_configuration()

app = FastAPI(
    title="Pet Travel Wholesale B2B API",
    description="Backend API for Pet Travel Wholesale warehouse management, purchasing, double-entry accounting, and VietQR matching.",
    version="1.0.0"
)

@app.middleware("http")
async def vercel_path_rewrite(request: Request, call_next):
    """
    Vercel rewrites /(.*) → /api/$1, so:
    - User visits /            → function receives /api/
    - User visits /api/v1/...  → function receives /api/api/v1/...
    - User visits /debug       → function receives /api/debug
    
    We strip the leading /api to restore the original path.
    """
    path = request.scope.get("path", "")
    if path.startswith("/api/"):
        request.scope["path"] = path[4:]  # strip "/api" prefix, keep "/"
    elif path == "/api":
        request.scope["path"] = "/"

    final_path = request.scope.get("path", "")
    if final_path.startswith(settings.API_V1_STR) and not is_public_api_path(final_path):
        try:
            require_internal_request(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    
    response = await call_next(request)
    if not settings.is_production:
        response.headers["X-Debug-Original-Path"] = path
        response.headers["X-Debug-Final-Path"] = request.scope.get("path", "")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": "pettravel-wholesale-backend",
        "message": "Welcome to Pet Travel B2B Wholesale API portal!"
    }

@app.get("/debug")
def debug_path(request: Request):
    if settings.is_production:
        return {"detail": "Not found"}
    return {
        "scope_path": request.scope.get("path"),
        "scope_raw_path": request.scope.get("raw_path", b"").decode("utf-8", errors="replace"),
        "url": str(request.url),
        "headers": {k: v for k, v in request.headers.items() if k.startswith("x-") or k == "host"}
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
