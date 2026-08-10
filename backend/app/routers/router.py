from fastapi import APIRouter
from app.routers.v1.endpoints import auth, orders, operations, accounting, products, suppliers, categories, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(operations.router, prefix="/operations", tags=["operations"])
api_router.include_router(accounting.router, prefix="/accounting", tags=["accounting"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["suppliers"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
