from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Dict, Any
from app.core.db import get_db
from app.models.wholesale import Order, OrderItem, QuoteVersion, QuoteAdjustment, PaymentRequest, PaymentProof, OrderComment
from app.schemas.wholesale import OrderCreate, OrderResponse
from app.services.inventory import reserve_stock, release_stock, consume_reservations
from app.services.accounting import post_order_deposit_receipt, post_order_sales_and_cost
from datetime import datetime, timezone, timedelta
import uuid

router = APIRouter()

@router.post("/", response_model=Dict[str, Any])
async def create_wholesale_order(
    order_data: Dict[str, Any], 
    db: AsyncSession = Depends(get_db)
):
    """
    Tạo đơn hàng sỉ mới và tự động giữ chỗ kho khả dụng.
    """
    order_id = f"ord_{uuid.uuid4().hex[:12]}"
    time_suffix = datetime.now(timezone.utc).strftime("%y%m%d")
    random_digits = uuid.uuid4().hex[:4].upper()
    order_number = f"PTW-{time_suffix}-{random_digits}"
    
    # 1. Tạo đơn hàng chính
    db_order = Order(
        id=order_id,
        number=order_number,
        customer_name=order_data.get("recipientName", "Khách hàng sỉ"),
        customer_company=order_data.get("recipientAddress", "Đại lý đối tác"),
        customer_id=order_data.get("customerId", "u_demo_customer"),
        commercial_status="draft",
        payment_status="unrequested",
        fulfillment_status="not_started",
        payment_intent=order_data.get("paymentIntent", "deposit_cod"),
        recipient_name=order_data.get("recipientName"),
        recipient_phone=order_data.get("recipientPhone"),
        recipient_address=order_data.get("recipientAddress")
    )
    db.add(db_order)
    
    # 2. Tạo items và kiểm tra giữ kho khả dụng
    items_to_reserve = []
    subtotal = 0
    for idx, item in enumerate(order_data.get("items", [])):
        item_id = f"item_{uuid.uuid4().hex[:12]}_{idx}"
        db_item = OrderItem(
            id=item_id,
            order_id=order_id,
            product_code=item["productCode"],
            product_name=item["productName"],
            variant_sku=item["variantSku"],
            variant_label=item["variantLabel"],
            quantity=item["quantity"],
            unit_price_snapshot=item["unitPriceSnapshot"],
            supplier_id=item.get("supplierId", "sup_pettravel")
        )
        db.add(db_item)
        subtotal += item["quantity"] * item["unitPriceSnapshot"]
        items_to_reserve.append({
            "variant_sku": item["variantSku"],
            "quantity": item["quantity"]
        })
        
    # Thử giữ chỗ kho
    has_stock = await reserve_stock(order_id, items_to_reserve, db)
    if not has_stock:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tồn kho khả dụng của sản phẩm không đủ phục vụ MOQ sỉ."
        )
        
    # 3. Tạo bản báo giá nháp ban đầu
    quote_id = f"q_1_{uuid.uuid4().hex[:8]}"
    deposit_rate = 0.3
    deposit_amount = int(subtotal * deposit_rate)
    db_quote = QuoteVersion(
        id=quote_id,
        order_id=order_id,
        version=1,
        status="published",
        subtotal=subtotal,
        final_total=subtotal,
        deposit_amount=deposit_amount,
        cod_remaining=subtotal - deposit_amount,
        shipping_fee_option="included",
        expires_at=datetime.utcnow() + timedelta(days=1)
    )
    db.add(db_quote)
    
    # 4. Thêm bình luận tự động của hệ thống
    db_comment = OrderComment(
        id=f"c_init_{uuid.uuid4().hex[:8]}",
        order_id=order_id,
        author="Hệ thống",
        audience="customer_visible",
        message=f"Đại lý đã lập đơn sỉ nháp {order_number}. Hệ thống tự động giữ kho an toàn trong 72 giờ."
    )
    db.add(db_comment)
    
    await db.commit()
    
    return {
        "status": "success",
        "message": "Tạo đơn sỉ thành công và đã hoàn tất giữ kho 72h.",
        "order_id": order_id,
        "order_number": order_number
    }

@router.post("/webhook/vietqr")
async def vietqr_webhook(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Webhook biến động số dư ngân hàng để đối soát VietQR tự động.
    Phân tích Reference Code để tự động chuyển payment_status đơn sỉ.
    """
    ref_code = payload.get("reference", "").upper()
    amount_received = payload.get("amount", 0)
    
    # Phân tích ref_code dạng: PTW-260810-XYZ-Q1-DEP
    if not ref_code.startswith("PTW-"):
        raise HTTPException(status_code=400, detail="Mã đối soát Reference không hợp lệ.")
        
    # Tìm đơn hàng dựa trên số đơn hàng
    parts = ref_code.split("-")
    if len(parts) < 3:
        raise HTTPException(status_code=400, detail="Mã đối soát không đúng định dạng.")
        
    order_number = f"PTW-{parts[1]}-{parts[2]}"
    ord_res = await db.execute(select(Order).filter(Order.number == order_number))
    order = ord_res.scalars().first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng sỉ tương ứng.")
        
    # Kiểm tra xem là thanh toán cọc hay thanh toán toàn bộ
    is_deposit = "DEP" in ref_code
    
    if is_deposit:
        order.payment_status = "deposit_confirmed"
        order.commercial_status = "customer_accepted"
        # Sinh bút toán kế toán cọc tự động
        await post_order_deposit_receipt(order.id, db)
    else:
        order.payment_status = "paid"
        order.commercial_status = "locked"
        # Tiêu thụ giữ kho sang xuất kho thực tế
        await consume_reservations(order.id, db)
        # Sinh bút toán kế toán doanh thu & giá vốn
        await post_order_sales_and_cost(order.id, db)
        
    # Ghi nhận bình luận hệ thống
    db_comment = OrderComment(
        id=f"c_pay_{uuid.uuid4().hex[:8]}",
        order_id=order.id,
        author="Kế toán hệ thống",
        audience="customer_visible",
        message=f"Đối soát khớp lệnh thành công giao dịch ngân hàng VietQR. Số tiền nhận: {amount_received:,} VND. Nội dung: {ref_code}."
    )
    db.add(db_comment)
    await db.commit()
    
    return {"status": "success", "message": "Đối soát ngân hàng hoàn tất, trạng thái đơn sỉ đã được cập nhật tự động."}
