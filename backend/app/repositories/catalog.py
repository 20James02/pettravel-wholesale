from __future__ import annotations

import json
import time
import uuid
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class CatalogError(ValueError):
    pass


_catalog_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
CATALOG_CACHE_TTL = 30.0  # 30 seconds
MAX_PERSISTED_IMAGE_URL_LENGTH = 2_048
DEFAULT_PRODUCT_IMAGE = "/product-food.svg"


def invalidate_catalog_cache() -> None:
    _catalog_cache.clear()


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, tuple):
        return [str(item) for item in value]
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return [str(item) for item in parsed] if isinstance(parsed, list) else []
    return []


def _validate_persisted_image_url(value: Any, field_name: str) -> str:
    clean_value = str(value or "").strip()
    if not clean_value:
        return ""
    if len(clean_value) > MAX_PERSISTED_IMAGE_URL_LENGTH:
        raise CatalogError(f"{field_name} vượt quá {MAX_PERSISTED_IMAGE_URL_LENGTH} ký tự.")
    if any(ord(character) < 32 or ord(character) == 127 for character in clean_value):
        raise CatalogError(f"{field_name} chứa ký tự điều khiển không hợp lệ.")

    if clean_value.startswith("/"):
        if clean_value.startswith("//") or "\\" in clean_value:
            raise CatalogError(f"{field_name} không phải đường dẫn nội bộ hợp lệ.")
        return clean_value

    try:
        parsed = urlsplit(clean_value)
    except ValueError as exc:
        raise CatalogError(f"{field_name} không phải URL hợp lệ.") from exc
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise CatalogError(f"{field_name} phải là đường dẫn nội bộ hoặc URL HTTPS đã tải lên.")
    return clean_value


def _safe_catalog_image_url(value: Any, fallback: str = DEFAULT_PRODUCT_IMAGE) -> str:
    try:
        return _validate_persisted_image_url(value, "Đường dẫn ảnh") or fallback
    except (CatalogError, ValueError):
        return fallback


def _safe_catalog_gallery(value: Any) -> list[str]:
    safe_images: list[str] = []
    for raw_image in _string_list(value)[:12]:
        try:
            image = _validate_persisted_image_url(raw_image, "Ảnh bộ sưu tập")
        except (CatalogError, ValueError):
            continue
        if image:
            safe_images.append(image)
    return safe_images


async def list_products(db: AsyncSession, role: str) -> list[dict[str, Any]]:
    now = time.monotonic()
    if role in _catalog_cache:
        cached_time, cached_data = _catalog_cache[role]
        if now - cached_time < CATALOG_CACHE_TTL:
            return cached_data
    result = await db.execute(
        text("""
            select
                p.id as product_id,
                p.code,
                p.name,
                p.brand,
                p.category,
                p.description,
                p.image_url as product_image_url,
                p.images,
                p.dimensions,
                p.weight,
                p.tags,
                v.id as variant_id,
                v.sku,
                v.label,
                v.barcode,
                v.image_url as variant_image_url,
                so.supplier_id,
                so.wholesale_price,
                so.min_order_qty,
                so.stock_qty
            from products p
            left join product_variants v
                on v.product_id = p.id and v.active = true
            left join supplier_offers so
                on so.product_variant_id = v.id and so.active = true
            where p.active = true
            order by p.code, v.sku, so.wholesale_price, so.id
        """)
    )

    products_by_id: dict[str, dict[str, Any]] = {}
    seen_variants: set[tuple[str, str]] = set()
    for row in result.mappings():
        product_id = str(row["product_id"])
        product = products_by_id.setdefault(
            product_id,
            {
                "id": product_id,
                "code": row["code"],
                "name": row["name"],
                "brand": row["brand"] or "Pet Travel",
                "category": row["category"],
                "description": row["description"],
                "imageUrl": _safe_catalog_image_url(row["product_image_url"]),
                "images": _safe_catalog_gallery(row["images"]),
                "dimensions": row["dimensions"],
                "weight": float(row["weight"] or 0),
                "tags": _string_list(row["tags"]),
                "variants": [],
            },
        )

        if not row["variant_id"]:
            continue

        variant_key = (product_id, str(row["variant_id"]))
        # The current frontend contract carries one supplier per variant. Pick
        # the cheapest active offer deterministically until the UI supports a
        # dedicated offer selector.
        if variant_key in seen_variants:
            continue
        seen_variants.add(variant_key)
        variant_dict: dict[str, Any] = {
            "id": str(row["variant_id"]),
            "sku": row["sku"],
            "label": row["label"],
            "barcode": row["barcode"],
            "stock": int(row["stock_qty"] or 0),
            "imageUrl": _safe_catalog_image_url(row["variant_image_url"]),
        }

        if role == "admin":
            variant_dict["wholesalePrice"] = int(row["wholesale_price"] or 0)
            variant_dict["minOrderQty"] = int(row["min_order_qty"] or 1)
            variant_dict["supplierId"] = str(row["supplier_id"]) if row["supplier_id"] else "sup_pettravel"
        elif role == "customer":
            variant_dict["wholesalePrice"] = int(row["wholesale_price"] or 0)
            variant_dict["minOrderQty"] = int(row["min_order_qty"] or 1)
            variant_dict["supplierId"] = "sup_pettravel"
        # For role == 'guest', wholesalePrice, minOrderQty, and supplierId are strictly omitted.

        product["variants"].append(variant_dict)

    products = list(products_by_id.values())
    _catalog_cache[role] = (now, products)
    return products


def _array_parameter(db: AsyncSession, value: Any) -> Any:
    values = _string_list(value)
    return json.dumps(values) if db.get_bind().dialect.name == "sqlite" else values


async def save_product_record(db: AsyncSession, payload: dict[str, Any]) -> str:
    code = str(payload.get("code") or "").strip()
    name = str(payload.get("name") or "").strip()
    category = str(payload.get("category") or "").strip()
    if not code or not name or not category:
        raise CatalogError("Mã, tên và danh mục sản phẩm là bắt buộc.")

    image_url = _validate_persisted_image_url(payload.get("imageUrl"), "Ảnh đại diện")
    gallery_images = _string_list(payload.get("images"))
    if len(gallery_images) > 12:
        raise CatalogError("Mỗi sản phẩm tối đa 12 ảnh.")
    gallery_images = [
        _validate_persisted_image_url(image, "Ảnh bộ sưu tập") for image in gallery_images
    ]
    raw_variants = payload.get("variants") or []
    if not isinstance(raw_variants, list):
        raise CatalogError("Danh sách biến thể không hợp lệ.")
    variant_image_urls: list[str] = []
    for raw_variant in raw_variants:
        if not isinstance(raw_variant, dict):
            raise CatalogError("Dữ liệu biến thể không hợp lệ.")
        variant_image_urls.append(
            _validate_persisted_image_url(raw_variant.get("imageUrl"), "Ảnh biến thể")
        )

    existing = (
        await db.execute(
            text("select id from products where id = :id or code = :code limit 1"),
            {"id": payload.get("id") or "", "code": code},
        )
    ).mappings().first()
    product_id = str(existing["id"]) if existing else str(payload.get("id") or f"prod_{uuid.uuid4().hex}")
    values = {
        "id": product_id,
        "code": code,
        "name": name,
        "brand": str(payload.get("brand") or "Pet Travel").strip(),
        "category": category,
        "description": payload.get("description"),
        "image_url": image_url,
        "images": _array_parameter(db, gallery_images),
        "dimensions": payload.get("dimensions"),
        "weight": payload.get("weight") or 0,
        "tags": _array_parameter(db, payload.get("tags")),
    }
    if existing:
        await db.execute(
            text("""update products set
                code = :code, name = :name, brand = :brand, category = :category,
                description = :description, image_url = :image_url, images = :images,
                dimensions = :dimensions, weight = :weight, tags = :tags, active = true
                where id = :id"""),
            values,
        )
    else:
        await db.execute(
            text("""insert into products
                (id, code, name, brand, category, description, image_url, images,
                 dimensions, weight, tags, active)
                values (:id, :code, :name, :brand, :category, :description, :image_url,
                        :images, :dimensions, :weight, :tags, true)"""),
            values,
        )

    await db.execute(
        text("""update supplier_offers set active = false
            where product_variant_id in (select id from product_variants where product_id = :product_id)"""),
        {"product_id": product_id},
    )
    await db.execute(
        text("update product_variants set active = false where product_id = :product_id"),
        {"product_id": product_id},
    )

    for variant_index, raw_variant in enumerate(raw_variants):
        sku = str(raw_variant.get("sku") or "").strip()
        label = str(raw_variant.get("label") or "").strip()
        supplier_id = str(raw_variant.get("supplierId") or "").strip()
        price = raw_variant.get("wholesalePrice")
        minimum = raw_variant.get("minOrderQty", 1)
        stock = raw_variant.get("stock", 0)
        if not sku or not label or not supplier_id or price is None:
            raise CatalogError("Mỗi biến thể cần SKU, nhãn, nhà cung cấp và giá sỉ.")
        if int(price) < 0 or int(minimum) <= 0 or int(stock) < 0:
            raise CatalogError("Giá, số lượng tối thiểu hoặc tồn kho không hợp lệ.")

        supplier = (
            await db.execute(
                text("select id from suppliers where id = :supplier_id and active = true"),
                {"supplier_id": supplier_id},
            )
        ).first()
        if not supplier:
            raise CatalogError(f"Nhà cung cấp {supplier_id} không tồn tại hoặc đã ngừng hoạt động.")

        existing_variant = (
            await db.execute(
                text("select id, product_id from product_variants where sku = :sku limit 1"),
                {"sku": sku},
            )
        ).mappings().first()
        if existing_variant and str(existing_variant["product_id"]) != product_id:
            raise CatalogError(f"SKU {sku} đã thuộc một sản phẩm khác.")
        variant_id = str(existing_variant["id"]) if existing_variant else str(
            raw_variant.get("id") or f"var_{uuid.uuid4().hex}"
        )
        variant_values = {
            "id": variant_id,
            "product_id": product_id,
            "sku": sku,
            "label": label,
            "barcode": raw_variant.get("barcode"),
            "image_url": variant_image_urls[variant_index],
        }
        if existing_variant:
            await db.execute(
                text("""update product_variants set label = :label, barcode = :barcode,
                    image_url = :image_url, active = true where id = :id"""),
                variant_values,
            )
        else:
            await db.execute(
                text("""insert into product_variants
                    (id, product_id, sku, label, barcode, image_url, active)
                    values (:id, :product_id, :sku, :label, :barcode, :image_url, true)"""),
                variant_values,
            )

        existing_offer = (
            await db.execute(
                text("""select id from supplier_offers
                    where supplier_id = :supplier_id and product_variant_id = :variant_id limit 1"""),
                {"supplier_id": supplier_id, "variant_id": variant_id},
            )
        ).mappings().first()
        offer_values = {
            "id": str(existing_offer["id"]) if existing_offer else f"offer_{uuid.uuid4().hex}",
            "supplier_id": supplier_id,
            "variant_id": variant_id,
            "price": int(price),
            "minimum": int(minimum),
            "stock": int(stock),
            "lead_time_days": int(raw_variant.get("leadTimeDays") or 1),
        }
        if existing_offer:
            await db.execute(
                text("""update supplier_offers set wholesale_price = :price,
                    min_order_qty = :minimum, stock_qty = :stock,
                    lead_time_days = :lead_time_days, active = true where id = :id"""),
                offer_values,
            )
        else:
            await db.execute(
                text("""insert into supplier_offers
                    (id, supplier_id, product_variant_id, wholesale_price, min_order_qty,
                     stock_qty, lead_time_days, active)
                    values (:id, :supplier_id, :variant_id, :price, :minimum,
                            :stock, :lead_time_days, true)"""),
                offer_values,
            )

    invalidate_catalog_cache()
    return product_id


async def deactivate_product(db: AsyncSession, identifier: str) -> bool:
    invalidate_catalog_cache()
    clean_identifier = identifier[2:] if identifier.startswith("p_") else identifier
    result = await db.execute(
        text("""update products set active = false
            where id = :identifier or code = :identifier or code = :clean_identifier"""),
        {"identifier": identifier, "clean_identifier": clean_identifier},
    )
    return bool(result.rowcount)
