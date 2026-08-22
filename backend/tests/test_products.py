import json

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.routers.v1.endpoints.products import delete_product, get_products, save_product


@pytest.mark.asyncio
async def test_catalog_reads_canonical_products_variants_and_supplier_offers(canonical_db_session):
    await canonical_db_session.execute(
        text("""insert into products
            (id, code, name, brand, category, description, image_url, images, dimensions, weight, tags)
            values ('prod_1', 'PT-001', 'Túi vận chuyển', 'Pet Travel', 'Túi', 'Bền',
                    '/bag.webp', :images, '40x30', 1.5, :tags)"""),
        {"images": json.dumps(["/bag-1.webp"]), "tags": json.dumps(["travel", "bag"])},
    )
    await canonical_db_session.execute(
        text("""insert into product_variants
            (id, product_id, sku, label, barcode, image_url)
            values ('var_1', 'prod_1', 'SKU-001', 'Màu xanh', '8930001', '/blue.webp')""")
    )
    await canonical_db_session.execute(
        text("""insert into suppliers (id, code, name, lead_time_days, admin_only)
            values ('sup_1', 'SUP-1', 'Nhà cung cấp 1', 2, 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into supplier_offers
            (id, supplier_id, product_variant_id, wholesale_price, min_order_qty, stock_qty, lead_time_days)
            values ('offer_1', 'sup_1', 'var_1', 250000, 2, 12, 2)""")
    )
    await canonical_db_session.commit()

    admin = await get_products("admin", canonical_db_session)
    customer = await get_products("customer", canonical_db_session)
    guest = await get_products("guest", canonical_db_session)

    assert admin[0]["id"] == "prod_1"
    assert admin[0]["images"] == ["/bag-1.webp"]
    assert admin[0]["tags"] == ["travel", "bag"]
    assert admin[0]["variants"] == [
        {
            "id": "var_1",
            "sku": "SKU-001",
            "label": "Màu xanh",
            "barcode": "8930001",
            "wholesalePrice": 250000,
            "minOrderQty": 2,
            "stock": 12,
            "supplierId": "sup_1",
            "imageUrl": "/blue.webp",
        }
    ]
    assert customer[0]["variants"][0]["supplierId"] == "sup_pettravel"
    assert guest[0]["variants"] == [
        {
            "id": "var_1",
            "sku": "SKU-001",
            "label": "Màu xanh",
            "barcode": "8930001",
            "stock": 12,
            "imageUrl": "/blue.webp",
        }
    ]
    # Strictly verify Guest does NOT receive wholesalePrice, minOrderQty, or supplierId
    assert "wholesalePrice" not in guest[0]["variants"][0]
    assert "minOrderQty" not in guest[0]["variants"][0]
    assert "supplierId" not in guest[0]["variants"][0]


@pytest.mark.asyncio
async def test_catalog_excludes_inactive_products(canonical_db_session):
    await canonical_db_session.execute(
        text("""insert into products
            (id, code, name, brand, category, active)
            values ('prod_hidden', 'HIDDEN', 'Ẩn', 'Pet Travel', 'Khác', 0)""")
    )
    await canonical_db_session.commit()

    assert await get_products("guest", canonical_db_session) == []


@pytest.mark.asyncio
async def test_catalog_never_emits_legacy_transient_image_payloads(canonical_db_session):
    await canonical_db_session.execute(
        text("""insert into products
            (id, code, name, brand, category, image_url, images)
            values ('prod_legacy', 'LEGACY', 'Ảnh cũ', 'Pet Travel', 'Khác',
                    'data:image/png;base64,AAAA', :images)"""),
        {"images": json.dumps(["data:image/jpeg;base64,BBBB", "/safe.webp", "blob:https://example.test/id"])},
    )
    await canonical_db_session.execute(
        text("""insert into product_variants
            (id, product_id, sku, label, image_url)
            values ('var_legacy', 'prod_legacy', 'LEGACY-SKU', 'Mặc định',
                    'data:image/webp;base64,CCCC')""")
    )
    await canonical_db_session.commit()

    products = await get_products("guest", canonical_db_session)
    serialized = json.dumps(products)

    assert products[0]["imageUrl"] == "/product-food.svg"
    assert products[0]["images"] == ["/safe.webp"]
    assert products[0]["variants"][0]["imageUrl"] == "/product-food.svg"
    assert "data:image" not in serialized
    assert "blob:" not in serialized


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("target", "unsafe_url"),
    [
        ("product", "data:image/png;base64,AAAA"),
        ("gallery", "blob:https://example.test/id"),
        ("variant", "http://cdn.example.test/image.webp"),
        ("product", "//cdn.example.test/image.webp"),
    ],
)
async def test_save_product_rejects_non_durable_image_urls(canonical_db_session, target, unsafe_url):
    payload = {
        "id": "prod_unsafe",
        "code": "UNSAFE",
        "name": "Ảnh không an toàn",
        "brand": "Pet Travel",
        "category": "Khác",
        "imageUrl": "/safe.webp",
        "images": ["/safe-gallery.webp"],
        "variants": [],
    }
    if target == "product":
        payload["imageUrl"] = unsafe_url
    elif target == "gallery":
        payload["images"] = [unsafe_url]
    else:
        payload["variants"] = [{"imageUrl": unsafe_url}]

    with pytest.raises(HTTPException) as exc_info:
        await save_product(payload, canonical_db_session)

    assert exc_info.value.status_code == 400
    count = await canonical_db_session.scalar(text("select count(*) from products where id = 'prod_unsafe'"))
    assert count == 0


@pytest.mark.asyncio
async def test_save_product_writes_canonical_variant_and_offer(canonical_db_session):
    await canonical_db_session.execute(
        text("""insert into suppliers (id, code, name, lead_time_days, admin_only)
            values ('sup_1', 'SUP-1', 'Nhà cung cấp 1', 2, 1)""")
    )
    await canonical_db_session.commit()

    result = await save_product(
        {
            "id": "prod_new",
            "code": "PT-NEW",
            "name": "Sản phẩm mới",
            "brand": "Pet Travel",
            "category": "Túi",
            "imageUrl": "/new.webp",
            "images": ["/new-1.webp"],
            "tags": ["new"],
            "variants": [
                {
                    "id": "var_new",
                    "sku": "SKU-NEW",
                    "label": "Mặc định",
                    "barcode": "893NEW",
                    "wholesalePrice": 100000,
                    "minOrderQty": 3,
                    "stock": 9,
                    "supplierId": "sup_1",
                    "imageUrl": "/variant.webp",
                }
            ],
        },
        canonical_db_session,
    )

    assert result["status"] == "success"
    products = await get_products("admin", canonical_db_session)
    assert products[0]["id"] == "prod_new"
    assert products[0]["variants"][0]["supplierId"] == "sup_1"
    assert products[0]["variants"][0]["wholesalePrice"] == 100000


@pytest.mark.asyncio
async def test_delete_product_soft_deactivates_catalog_record(canonical_db_session):
    await canonical_db_session.execute(
        text("""insert into products
            (id, code, name, brand, category, active)
            values ('prod_delete', 'DELETE-ME', 'Xóa', 'Pet Travel', 'Khác', 1)""")
    )
    await canonical_db_session.commit()

    result = await delete_product("prod_delete", canonical_db_session)

    assert result["status"] == "success"
    assert await get_products("guest", canonical_db_session) == []
