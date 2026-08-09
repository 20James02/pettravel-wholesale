from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from app.models.wholesale import StockReservation, ProductVariant, OrderItem, Order

async def get_available_stock(sku: str, db: AsyncSession) -> int:
    # 1. Lấy tồn kho thực tế của SKU
    variant_res = await db.execute(select(ProductVariant).filter(ProductVariant.sku == sku))
    variant = variant_res.scalars().first()
    if not variant:
        return 0
    
    # 2. Lấy tổng lượng đang bị giữ chỗ (status == "reserved")
    res_qty_res = await db.execute(
        select(func.sum(StockReservation.quantity))
        .filter(StockReservation.variant_sku == sku)
        .filter(StockReservation.status == "reserved")
    )
    reserved_qty = res_qty_res.scalar() or 0
    
    # Tồn kho khả dụng = Thực tế - Giữ chỗ
    available = variant.stock - reserved_qty
    return max(0, available)

import uuid

async def reserve_stock(order_id: str, items: List[Dict[str, Any]], db: AsyncSession) -> bool:
    """
    Giữ chỗ tồn kho cho đơn hàng sỉ trong 72 giờ.
    Gom nhóm số lượng theo SKU và kiểm tra tổng tồn kho khả dụng trước khi tạo giữ chỗ.
    """
    expires_at = datetime.now(timezone.utc) + timedelta(hours=72)
    
    # 1. Gom nhóm tổng số lượng yêu cầu theo từng variant_sku
    required_by_sku: Dict[str, int] = {}
    for item in items:
        sku = item["variant_sku"]
        required_by_sku[sku] = required_by_sku.get(sku, 0) + item["quantity"]
        
    # 2. Kiểm tra tồn kho khả dụng cho tất cả SKU đã gộp
    for sku, req_qty in required_by_sku.items():
        available = await get_available_stock(sku, db)
        if available < req_qty:
            return False
            
    # 3. Tạo bản ghi giữ hàng cho từng item
    for item in items:
        sku = item["variant_sku"]
        req_qty = item["quantity"]
        
        db_reservation = StockReservation(
            id=f"res_{uuid.uuid4().hex[:12]}_{sku}",
            order_id=order_id,
            variant_sku=sku,
            quantity=req_qty,
            status="reserved",
            reason="Giữ chỗ kho tự động 72h cho đơn đại lý.",
            expires_at=expires_at
        )
        db.add(db_reservation)
        
    await db.flush()
    return True

async def release_stock(order_id: str, db: AsyncSession) -> int:
    """
    Nhả giữ hàng thủ công hoặc hủy giữ hàng.
    """
    result = await db.execute(
        select(StockReservation)
        .filter(StockReservation.order_id == order_id)
        .filter(StockReservation.status == "reserved")
    )
    reservations = result.scalars().all()
    
    count = 0
    for res in reservations:
        res.status = "released"
        res.reason = "Nhả giữ hàng thủ công giải phóng tồn kho."
        count += 1
        
    await db.flush()
    return count

async def consume_reservations(order_id: str, db: AsyncSession) -> int:
    """
    Thực hiện xuất kho thực tế (khi đơn hàng hoàn tất hoặc giao đi).
    Trừ trực tiếp vào tồn kho thực tế của Variant và cập nhật trạng thái giữ hàng thành 'consumed'.
    """
    result = await db.execute(
        select(StockReservation)
        .filter(StockReservation.order_id == order_id)
        .filter(StockReservation.status == "reserved")
    )
    reservations = result.scalars().all()
    
    count = 0
    for res in reservations:
        # Trừ tồn kho thực tế
        var_res = await db.execute(select(ProductVariant).filter(ProductVariant.sku == res.variant_sku))
        variant = var_res.scalars().first()
        if variant:
            variant.stock = max(0, variant.stock - res.quantity)
            
        res.status = "consumed"
        res.reason = "Xuất kho thực tế hoàn tất đơn sỉ."
        count += 1
        
    await db.flush()
    return count

async def cleanup_expired_reservations(db: AsyncSession) -> int:
    """
    Tự động quét và hủy giữ hàng quá hạn 72 giờ (phục vụ cron background task).
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(StockReservation)
        .filter(StockReservation.status == "reserved")
        .filter(StockReservation.expires_at < now)
    )
    expired = result.scalars().all()
    
    count = 0
    for res in expired:
        res.status = "expired"
        res.reason = "Bút toán giữ hàng đã hết hiệu lực 72h."
        count += 1
        
        # Cập nhật trạng thái đơn hàng sỉ tương ứng
        ord_res = await db.execute(select(Order).filter(Order.id == res.order_id))
        order = ord_res.scalars().first()
        if order and order.commercial_status == "submitted":
            order.commercial_status = "draft"  # Trả về draft
            
    await db.flush()
    return count
