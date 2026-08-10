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
    
    response = await call_next(request)
    # Temporary debug headers
    response.headers["X-Debug-Original-Path"] = path
    response.headers["X-Debug-Final-Path"] = request.scope.get("path", "")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    from app.core.db import engine
    from app.models.wholesale import Base, User, Product, ProductVariant, Supplier, AppSetting
    from app.core.security import get_password_hash
    from sqlalchemy.future import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as db:
        try:
            user_res = await db.execute(select(User).filter(User.email == "27jd07@gmail.com"))
            admin_user = user_res.scalars().first()
            if not admin_user:
                # Seed default admin user
                admin = User(
                    id="u_admin_27jd07",
                    email="27jd07@gmail.com",
                    hashed_password=get_password_hash("HvT@27072002"),
                    name="Quản trị viên (Admin)",
                    phone="0987654321",
                    role="super_admin",
                    company="Pet Travel Wholesale B2B"
                )
                db.add(admin)
                
                # Seed default demo users
                demo_minh = User(
                    id="u_demo_minh",
                    email="minh@pettravel.vn",
                    hashed_password=get_password_hash("123456789abc"),
                    name="Đại lý sỉ (Minh)",
                    phone="0911223344",
                    role="customer_owner",
                    company="Happy Paws Pet Shop"
                )
                db.add(demo_minh)
                
                # Seed default supplier
                supplier = Supplier(
                    id="sup_pettravel",
                    code="PETTRAVEL",
                    name="Pet Travel Imports Co.",
                    lead_time_days=3,
                    is_admin_only=False
                )
                db.add(supplier)
                
                # Seed default categories
                cats = AppSetting(
                    key="product_categories",
                    value={"categories": ["Túi vận chuyển", "Ăn uống du lịch", "Vệ sinh"]}
                )
                db.add(cats)
                
                # Seed default policy
                policy = AppSetting(
                    key="admin_policy",
                    value={
                        "freeShippingThreshold": 5000000,
                        "defaultDepositRate": 0.3,
                        "maxOperatorDiscountRate": 0.08,
                        "requireManagerApprovalAbove": 500000
                    }
                )
                db.add(policy)
                
                # Seed default products
                p1 = Product(
                    code="BAG-001",
                    name="Túi vận chuyển phi hành gia cao cấp",
                    brand="Pet Travel",
                    category="Túi vận chuyển",
                    description="Túi vận chuyển phi hành gia chất liệu nhựa cứng bền bỉ, thông thoáng, thích hợp cho chó mèo dưới 8kg.",
                    image_url="/product-bag.svg",
                    images=["/product-bag.svg"],
                    dimensions="42x32x25 cm",
                    weight=1.2,
                    tags="phithanhgia,tui,vanchuyen"
                )
                db.add(p1)
                
                v1 = ProductVariant(
                    sku="BAG-001-BLU",
                    product_code="BAG-001",
                    label="Màu Xanh Dương",
                    wholesale_price=180000,
                    min_order_qty=5,
                    stock=150,
                    supplier_id="sup_pettravel",
                    image_url="/product-bag.svg"
                )
                db.add(v1)
                
                v2 = ProductVariant(
                    sku="BAG-001-RED",
                    product_code="BAG-001",
                    label="Màu Đỏ Nổi Bật",
                    wholesale_price=185000,
                    min_order_qty=5,
                    stock=120,
                    supplier_id="sup_pettravel",
                    image_url="/product-bag.svg"
                )
                db.add(v2)
                
                p2 = Product(
                    code="FOOD-002",
                    name="Bát ăn du lịch gấp gọn silicone",
                    brand="Pet Travel",
                    category="Ăn uống du lịch",
                    description="Bát ăn du lịch chất liệu silicone thực phẩm an toàn, gấp gọn tiện lợi mang đi dã ngoại.",
                    image_url="/product-food.svg",
                    images=["/product-food.svg"],
                    dimensions="Đường kính 13cm",
                    weight=0.1,
                    tags="batan,gapgon,dulich"
                )
                db.add(p2)
                
                v3 = ProductVariant(
                    sku="FOOD-002-GRN",
                    product_code="FOOD-002",
                    label="Màu Xanh Lá",
                    wholesale_price=25000,
                    min_order_qty=10,
                    stock=300,
                    supplier_id="sup_pettravel",
                    image_url="/product-food.svg"
                )
                db.add(v3)
                
                v4 = ProductVariant(
                    sku="FOOD-002-YLW",
                    product_code="FOOD-002",
                    label="Màu Vàng",
                    wholesale_price=25000,
                    min_order_qty=10,
                    stock=250,
                    supplier_id="sup_pettravel",
                    image_url="/product-food.svg"
                )
                db.add(v4)
                
                await db.commit()
                print("Database tables initialized and seeded successfully!")
        except Exception as e:
            await db.rollback()
            print(f"Error during startup DB check / seeding: {e}")

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
