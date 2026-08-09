from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
from app.core.db import get_db
from app.services.inventory import get_available_stock, release_stock, consume_reservations

router = APIRouter()

@router.get("/available-stock", response_model=Dict[str, Any])
async def check_sku_availability(
    sku: str, 
    db: AsyncSession = Depends(get_db)
):
    """
    Kiểm tra tồn kho khả dụng thực tế của một SKU (Thực tế - Đang giữ chỗ sỉ).
    """
    qty = await get_available_stock(sku, db)
    return {
        "sku": sku,
        "available_qty": qty,
        "status": "in_stock" if qty > 0 else "out_of_stock"
    }

@router.post("/reservation", response_model=Dict[str, Any])
async def manage_stock_reservation(
    payload: Dict[str, Any], 
    db: AsyncSession = Depends(get_db)
):
    """
    Điều khiển trạng thái giữ chỗ kho (reserve_order, release_order, consume_order).
    """
    action = payload.get("action")
    order_id = payload.get("orderId")
    
    if not order_id or not action:
        raise HTTPException(status_code=400, detail="Thiếu orderId hoặc action.")
        
    if action == "release_order":
        released_count = await release_stock(order_id, db)
        await db.commit()
        return {
            "status": "success",
            "message": f"Đã giải phóng thành công {released_count} dòng sản phẩm giữ chỗ về kho khả dụng."
        }
        
    elif action == "consume_order":
        consumed_count = await consume_reservations(order_id, db)
        await db.commit()
        return {
            "status": "success",
            "message": f"Đã thực hiện xuất kho thực tế cho {consumed_count} dòng sản phẩm."
        }
        
    else:
        raise HTTPException(status_code=400, detail="Hành động giữ chỗ không hợp lệ.")
