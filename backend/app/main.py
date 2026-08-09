from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.routers.router import api_router
from app.core.config import settings
import uvicorn

app = FastAPI(
    title="Pet Travel Wholesale B2B API",
    description="Backend API for Pet Travel Wholesale warehouse management, purchasing, double-entry accounting, and VietQR matching.",
    version="1.0.0"
)

@app.middleware("http")
async def vercel_path_rewrite(request: Request, call_next):
    original_path = request.scope.get("path", "")
    # Try multiple Vercel headers to find original path
    forwarded = (
        request.headers.get("x-matched-path")
        or request.headers.get("x-invoke-path")
        or request.headers.get("x-forwarded-path")
        or request.headers.get("x-original-url")
    )
    if forwarded:
        clean = forwarded.split("?")[0]
        request.scope["path"] = clean
    elif original_path.startswith("/api/index.py"):
        request.scope["path"] = original_path.replace("/api/index.py", "", 1) or "/"
    elif original_path == "/api":
        request.scope["path"] = "/"
    
    response = await call_next(request)
    # Inject debug headers
    response.headers["X-Debug-Original-Path"] = original_path
    response.headers["X-Debug-Forwarded"] = str(forwarded)
    response.headers["X-Debug-Final-Path"] = request.scope.get("path", "")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    return {
        "scope_path": request.scope.get("path"),
        "scope_raw_path": request.scope.get("raw_path", b"").decode("utf-8", errors="replace"),
        "url": str(request.url),
        "headers": {k: v for k, v in request.headers.items() if k.startswith("x-") or k == "host"}
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
