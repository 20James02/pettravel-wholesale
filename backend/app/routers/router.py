from fastapi import APIRouter
from app.routers.v1.endpoints import auth, orders, operations, accounting

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(operations.router, prefix="/operations", tags=["operations"])
api_router.include_router(accounting.router, prefix="/accounting", tags=["accounting"])
