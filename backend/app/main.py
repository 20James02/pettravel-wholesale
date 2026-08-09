from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.router import api_router
from app.core.config import settings
import uvicorn

app = FastAPI(
    title="Pet Travel Wholesale B2B API",
    description="Backend API for Pet Travel Wholesale warehouse management, purchasing, double-entry accounting, and VietQR matching.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(api_router, prefix="/v1")
app.include_router(api_router, prefix="/api/index.py/api/v1")
app.include_router(api_router, prefix="/api/index.py/v1")

@app.get("/")
@app.get("/api")
@app.get("/api/index.py")
def read_root():
    return {
        "status": "healthy",
        "service": "pettravel-wholesale-backend",
        "message": "Welcome to Pet Travel B2B Wholesale API portal!"
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
