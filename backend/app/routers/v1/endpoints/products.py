from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Dict, Any
from app.core.db import get_db
from app.models.wholesale import Product, ProductVariant

router = APIRouter()

_db_initialized = False

async def ensure_db_initialized(db: AsyncSession):
    global _db_initialized
    if _db_initialized:
        return
        
    from app.models.wholesale import Base, User, Product as DBProduct, ProductVariant as DBProductVariant, Supplier, AppSetting
    from app.core.security import get_password_hash
    from app.core.db import engine
    
    # 1. Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    # 2. Seed default data
    try:
        user_res = await db.execute(select(User).filter(User.email == "27jd07@gmail.com"))
        admin_user = user_res.scalars().first()
        if not admin_user:
            # Admin User
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
            
            # Demo User
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
            
            # Supplier
            supplier = Supplier(
                id="sup_pettravel",
                code="PETTRAVEL",
                name="Pet Travel Imports Co.",
                lead_time_days=3,
                is_admin_only=False
            )
            db.add(supplier)
            
            # Settings
            cats = AppSetting(
                key="product_categories",
                value={"categories": ["Túi vận chuyển", "Ăn uống du lịch", "Vệ sinh"]}
            )
            db.add(cats)
            
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
            
            # Products
            p1 = DBProduct(
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
            
            v1 = DBProductVariant(
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
            
            v2 = DBProductVariant(
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
            
            p2 = DBProduct(
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
            
            v3 = DBProductVariant(
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
            
            v4 = DBProductVariant(
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
    except Exception as e:
        await db.rollback()
        print(f"Error during lazy seeding: {e}")
        
    _db_initialized = True

@router.get("/debug-db")
async def debug_db(db: AsyncSession = Depends(get_db)):
    import traceback
    from sqlalchemy import text
    from app.core.db import engine
    
    info = {}
    try:
        from app.core.config import settings
        db_url = settings.async_database_url
        # Extract hostname and port safely even if there are multiple @ symbols
        host_part = db_url.split("@")[-1]
        host_and_port = host_part.split("/")[0]
        if ":" in host_and_port:
            hostname = host_and_port.split(":")[0]
            port = host_and_port.split(":")[1]
        else:
            hostname = host_and_port
            port = "5432"
        info["parsed_hostname"] = hostname
        info["parsed_port"] = port
        
        result = await db.execute(text("SELECT 1"))
        val = result.scalar()
        info["connection_test"] = f"Success: {val}"
    except Exception as e:
        info["error"] = str(e)
        info["traceback"] = traceback.format_exc()
        
    return info

@router.get("/", response_model=List[Dict[str, Any]])
async def get_products(role: str = "guest", db: AsyncSession = Depends(get_db)):
    """
    Truy xuất danh mục sản phẩm sỉ kèm theo các phân loại sản phẩm.
    """
    await ensure_db_initialized(db)
    result = await db.execute(
        select(Product).options(selectinload(Product.variants))
    )
    products = result.scalars().all()
    
    output = []
    for p in products:
        variants_data = []
        for v in p.variants:
            variants_data.append({
                "id": f"v_{v.sku}",
                "sku": v.sku,
                "label": v.label,
                "wholesalePrice": v.wholesale_price,
                "minOrderQty": v.min_order_qty,
                "stock": v.stock,
                "supplierId": v.supplier_id,
                "imageUrl": v.image_url or "/product-food.svg"
            })
        
        output.append({
            "id": f"p_{p.code}",
            "code": p.code,
            "name": p.name,
            "brand": p.brand or "Pet Travel",
            "category": p.category,
            "description": p.description,
            "imageUrl": p.image_url or "/product-food.svg",
            "images": p.images or [],
            "dimensions": p.dimensions,
            "weight": p.weight,
            "tags": [t.strip() for t in p.tags.split(",")] if p.tags else [],
            "variants": variants_data
        })
    return output

@router.post("/", response_model=Dict[str, Any])
async def save_product(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Thêm mới hoặc cập nhật một sản phẩm và các phân loại tương ứng.
    """
    code = payload.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Mã sản phẩm (code) là bắt buộc.")
        
    res = await db.execute(select(Product).filter(Product.code == code))
    db_product = res.scalars().first()
    
    tags_str = ",".join(payload.get("tags", [])) if isinstance(payload.get("tags"), list) else payload.get("tags", "")
    
    if not db_product:
        db_product = Product(
            code=code,
            name=payload.get("name", ""),
            category=payload.get("category", ""),
            brand=payload.get("brand"),
            image_url=payload.get("imageUrl"),
            images=payload.get("images", []),
            dimensions=payload.get("dimensions"),
            weight=payload.get("weight", 0.0),
            description=payload.get("description"),
            tags=tags_str
        )
        db.add(db_product)
    else:
        db_product.name = payload.get("name", db_product.name)
        db_product.category = payload.get("category", db_product.category)
        db_product.brand = payload.get("brand", db_product.brand)
        db_product.image_url = payload.get("imageUrl", db_product.image_url)
        db_product.images = payload.get("images", db_product.images)
        db_product.dimensions = payload.get("dimensions", db_product.dimensions)
        db_product.weight = payload.get("weight", db_product.weight)
        db_product.description = payload.get("description", db_product.description)
        db_product.tags = tags_str

    await db.flush()

    # Xóa các variants cũ và thêm các variants mới để tránh xung đột
    from sqlalchemy import delete
    await db.execute(
        delete(ProductVariant).where(ProductVariant.product_code == code)
    )
    
    for variant in payload.get("variants", []):
        db_variant = ProductVariant(
            sku=variant["sku"],
            product_code=code,
            label=variant["label"],
            wholesale_price=variant["wholesalePrice"],
            min_order_qty=variant.get("minOrderQty", 1),
            stock=variant.get("stock", 0),
            supplier_id=variant.get("supplierId"),
            image_url=variant.get("imageUrl")
        )
        db.add(db_variant)
        
    await db.commit()
    return {"status": "success", "message": "Lưu sản phẩm thành công."}

@router.delete("/{code}", response_model=Dict[str, Any])
async def delete_product(code: str, db: AsyncSession = Depends(get_db)):
    """
    Xóa một sản phẩm dựa trên code.
    """
    clean_code = code[2:] if code.startswith("p_") else code
    res = await db.execute(select(Product).filter((Product.code == code) | (Product.code == clean_code)))
    product = res.scalars().first()
    if not product:
        raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm.")
        
    await db.delete(product)
    await db.commit()
    return {"status": "success", "message": "Xóa sản phẩm thành công."}
