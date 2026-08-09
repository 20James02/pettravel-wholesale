import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy.future import select
from app.models.wholesale import Product, ProductVariant, Supplier, StockReservation
from app.services.inventory import (
    get_available_stock,
    reserve_stock,
    release_stock,
    consume_reservations,
    cleanup_expired_reservations
)

@pytest.mark.asyncio
async def test_available_stock_calculations(db_session):
    # 1. Thêm Nhà cung cấp và Sản phẩm mẫu
    supplier = Supplier(id="sup_test", code="TESTSUP", name="Test Supplier")
    db_session.add(supplier)
    
    product = Product(code="PTEST", name="Product Test", category="Food")
    db_session.add(product)
    
    variant = ProductVariant(
        sku="PTEST-V1",
        product_code="PTEST",
        label="Size M",
        wholesale_price=100000,
        min_order_qty=5,
        stock=100,
        supplier_id="sup_test"
    )
    db_session.add(variant)
    await db_session.commit()
    
    # 2. Kiểm tra khi chưa có giữ hàng
    avail_qty = await get_available_stock("PTEST-V1", db_session)
    assert avail_qty == 100
    
    # 3. Tạo một giữ chỗ kho (reserved) 10 sản phẩm
    res = StockReservation(
        id="res_test_1",
        order_id="ord_test_1",
        variant_sku="PTEST-V1",
        quantity=10,
        status="reserved",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=72)
    )
    db_session.add(res)
    await db_session.commit()
    
    # Tồn kho khả dụng giảm còn 90
    avail_qty = await get_available_stock("PTEST-V1", db_session)
    assert avail_qty == 90
    
    # 4. Khi giải phóng giữ hàng (released), tồn kho khả dụng tăng lại 100
    res.status = "released"
    await db_session.commit()
    avail_qty = await get_available_stock("PTEST-V1", db_session)
    assert avail_qty == 100

@pytest.mark.asyncio
async def test_reserve_stock_failures(db_session):
    # Thêm sản phẩm có tồn kho thực tế là 5
    supplier = Supplier(id="sup_test", code="TESTSUP", name="Test Supplier")
    db_session.add(supplier)
    product = Product(code="PTEST", name="Product Test", category="Food")
    db_session.add(product)
    variant = ProductVariant(
        sku="PTEST-V1",
        product_code="PTEST",
        label="Size M",
        wholesale_price=100000,
        min_order_qty=5,
        stock=5,
        supplier_id="sup_test"
    )
    db_session.add(variant)
    await db_session.commit()
    
    # Yêu cầu mua 10 sản phẩm (lớn hơn tồn kho khả dụng là 5)
    success = await reserve_stock("ord_test", [{"variant_sku": "PTEST-V1", "quantity": 10}], db_session)
    assert success is False  # Thất bại do không đủ hàng
    
    # Yêu cầu mua 5 sản phẩm (đủ tồn kho)
    success = await reserve_stock("ord_test", [{"variant_sku": "PTEST-V1", "quantity": 5}], db_session)
    assert success is True  # Thành công
    
    # Kiểm tra tồn khả dụng hiện thời phải bằng 0
    avail_qty = await get_available_stock("PTEST-V1", db_session)
    assert avail_qty == 0

@pytest.mark.asyncio
async def test_cleanup_expired_reservations(db_session):
    supplier = Supplier(id="sup_test", code="TESTSUP", name="Test Supplier")
    db_session.add(supplier)
    product = Product(code="PTEST", name="Product Test", category="Food")
    db_session.add(product)
    variant = ProductVariant(
        sku="PTEST-V1",
        product_code="PTEST",
        label="Size M",
        wholesale_price=100000,
        min_order_qty=5,
        stock=20,
        supplier_id="sup_test"
    )
    db_session.add(variant)
    
    # Tạo bản ghi giữ hàng quá hạn (đã tạo từ 4 ngày trước)
    expired_res = StockReservation(
        id="res_exp",
        order_id="ord_exp",
        variant_sku="PTEST-V1",
        quantity=5,
        status="reserved",
        expires_at=datetime.now(timezone.utc) - timedelta(days=1)
    )
    db_session.add(expired_res)
    await db_session.commit()
    
    # Chạy dọn dẹp expired
    cleaned_count = await cleanup_expired_reservations(db_session)
    assert cleaned_count == 1
    
    # Kiểm tra trạng thái đã chuyển sang 'expired'
    assert expired_res.status == "expired"
    
    # Tồn kho khả dụng phải khôi phục lại thành 20
    avail_qty = await get_available_stock("PTEST-V1", db_session)
    assert avail_qty == 20
