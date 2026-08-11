from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Dict, Any
from app.core.db import get_db
from app.models.wholesale import Product, ProductVariant

router = APIRouter()

@router.get("/", response_model=List[Dict[str, Any]])
async def get_products(role: str = "guest", db: AsyncSession = Depends(get_db)):
    """
    Truy xuất danh mục sản phẩm sỉ kèm theo các phân loại sản phẩm.
    """
    result = await db.execute(
        select(Product).options(selectinload(Product.variants))
    )
    products = result.scalars().all()
    
    output = []
    for p in products:
        variants_data = []
        if role != "guest":
            for v in p.variants:
                variant_data = {
                    "id": f"v_{v.sku}",
                    "sku": v.sku,
                    "label": v.label,
                    "wholesalePrice": v.wholesale_price,
                    "minOrderQty": v.min_order_qty,
                    "stock": v.stock,
                    "supplierId": v.supplier_id,
                    "imageUrl": v.image_url or "/product-food.svg"
                }
                if role != "admin":
                    variant_data["supplierId"] = "sup_pettravel"
                variants_data.append(variant_data)
        
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
