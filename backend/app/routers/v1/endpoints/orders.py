from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Dict, Any
from app.core.db import get_db
from app.models.wholesale import Order, OrderItem, QuoteVersion, QuoteAdjustment, PaymentRequest, PaymentProof, OrderComment, User
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
        expires_at=datetime.now(timezone.utc) + timedelta(days=1)
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

@router.get("/legacy-list", response_model=List[Dict[str, Any]], include_in_schema=False)
async def list_orders(
    user_id: str = None,
    is_admin: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """
    Truy xuất toàn bộ danh sách đơn hàng kèm chi tiết báo giá, thanh toán và bình luận.
    """
    query = select(Order).options(
        selectinload(Order.items),
        selectinload(Order.quotes).selectinload(QuoteVersion.adjustments),
        selectinload(Order.payment_requests).selectinload(PaymentRequest.payment_proofs),
        selectinload(Order.payment_proofs),
        selectinload(Order.comments)
    )
    if not is_admin and user_id:
        query = query.filter(Order.customer_id == user_id)
        
    query = query.order_by(Order.created_at.desc())
    res = await db.execute(query)
    orders = res.scalars().all()
    
    output = []
    for o in orders:
        staff_name = None
        if o.assigned_staff_id:
            staff_res = await db.execute(select(User).filter(User.id == o.assigned_staff_id))
            staff = staff_res.scalars().first()
            staff_name = staff.name if staff else None
            
        items_data = [
            {
                "id": item.id,
                "productCode": item.product_code,
                "productName": item.product_name,
                "variantSku": item.variant_sku,
                "variantLabel": item.variant_label,
                "quantity": item.quantity,
                "unitPriceSnapshot": item.unit_price_snapshot,
                "supplierId": item.supplier_id
            }
            for item in o.items
        ]
        
        quotes_data = []
        for q in o.quotes:
            adjustments_data = [
                {
                    "id": adj.id,
                    "type": adj.type,
                    "label": adj.label,
                    "amount": adj.amount,
                    "requiresApproval": adj.requires_approval
                }
                for adj in q.adjustments
            ]
            quotes_data.append({
                "id": q.id,
                "version": q.version,
                "status": q.status,
                "subtotal": q.subtotal,
                "finalTotal": q.final_total,
                "depositAmount": q.deposit_amount,
                "codRemaining": q.cod_remaining,
                "shippingFeeOption": q.shipping_fee_option,
                "expiresAt": q.expires_at.isoformat() if q.expires_at else None,
                "adjustments": adjustments_data
            })
            
        pr_data = []
        for pr in o.payment_requests:
            proofs_data = [
                {
                    "id": p.id,
                    "paymentRequestId": p.payment_request_id,
                    "fileName": p.file_name,
                    "uploadedAt": p.uploaded_at.isoformat() if p.uploaded_at else None,
                    "status": p.status
                }
                for p in pr.payment_proofs
            ]
            pr_data.append({
                "id": pr.id,
                "purpose": pr.purpose,
                "amount": pr.amount,
                "reference": pr.reference,
                "qrPayload": pr.qr_payload,
                "status": pr.status,
                "expiresAt": pr.expires_at.isoformat() if pr.expires_at else None,
                "paymentProofs": proofs_data
            })
            
        proofs_orphan_data = [
            {
                "id": p.id,
                "paymentRequestId": p.payment_request_id,
                "fileName": p.file_name,
                "uploadedAt": p.uploaded_at.isoformat() if p.uploaded_at else None,
                "status": p.status
            }
            for p in o.payment_proofs
        ]
        
        comments_data = [
            {
                "id": c.id,
                "author": c.author,
                "audience": c.audience,
                "message": c.message,
                "createdAt": c.created_at.isoformat() if c.created_at else None
            }
            for c in o.comments
        ]
        
        output.append({
            "id": o.id,
            "number": o.number,
            "customerName": o.customer_name,
            "customerCompany": o.customer_company,
            "customerId": o.customer_id,
            "assignedStaffId": o.assigned_staff_id,
            "assignedStaffName": staff_name,
            "commercialStatus": o.commercial_status,
            "paymentStatus": o.payment_status,
            "fulfillmentStatus": o.fulfillment_status,
            "paymentIntent": o.payment_intent,
            "invoiceRequested": o.invoice_requested,
            "createdAt": o.created_at.isoformat(),
            "updatedAt": o.updated_at.isoformat(),
            "recipientName": o.recipient_name,
            "recipientPhone": o.recipient_phone,
            "recipientAddress": o.recipient_address,
            "items": items_data,
            "quoteVersions": quotes_data,
            "paymentRequests": pr_data,
            "paymentProofs": proofs_orphan_data,
            "comments": comments_data
        })
        
    return output

@router.post("/legacy-save", response_model=Dict[str, Any], include_in_schema=False)
async def save_order(
    payload: Dict[str, Any],
    creator_id: str = "u_demo_customer",
    db: AsyncSession = Depends(get_db)
):
    """
    Lưu hoặc cập nhật trạng thái toàn bộ cấu trúc đơn hàng bao gồm items, báo giá, thanh toán, bình luận.
    """
    order_data = payload.get("order")
    if not order_data:
        raise HTTPException(status_code=400, detail="Thiếu dữ liệu đơn hàng.")
        
    order_id = order_data["id"]
    res = await db.execute(select(Order).filter(Order.id == order_id))
    o = res.scalars().first()
    
    if not o:
        o = Order(
            id=order_id,
            number=order_data["number"],
            customer_name=order_data["customerName"],
            customer_company=order_data.get("customerCompany", ""),
            customer_id=order_data["customerId"],
            assigned_staff_id=order_data.get("assignedStaffId"),
            assigned_staff_name=order_data.get("assignedStaffName"),
            commercial_status=order_data["commercialStatus"],
            payment_status=order_data["paymentStatus"],
            fulfillment_status=order_data["fulfillmentStatus"],
            payment_intent=order_data["paymentIntent"],
            invoice_requested=order_data.get("invoiceRequested", False),
            recipient_name=order_data.get("recipientName"),
            recipient_phone=order_data.get("recipientPhone"),
            recipient_address=order_data.get("recipientAddress")
        )
        db.add(o)
    else:
        o.commercial_status = order_data["commercialStatus"]
        o.payment_status = order_data["paymentStatus"]
        o.fulfillment_status = order_data["fulfillmentStatus"]
        o.payment_intent = order_data["paymentIntent"]
        o.invoice_requested = order_data.get("invoiceRequested", o.invoice_requested)
        o.recipient_name = order_data.get("recipientName", o.recipient_name)
        o.recipient_phone = order_data.get("recipientPhone", o.recipient_phone)
        o.recipient_address = order_data.get("recipientAddress", o.recipient_address)
        o.assigned_staff_id = order_data.get("assignedStaffId", o.assigned_staff_id)
        
    await db.flush()
    
    # 2. Cập nhật items
    from sqlalchemy import delete
    if "items" in order_data:
        await db.execute(delete(OrderItem).where(OrderItem.order_id == order_id))
        for item in order_data["items"]:
            db_item = OrderItem(
                id=item.get("id") or f"oi_{uuid.uuid4().hex[:12]}",
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
            
    # 3. Cập nhật báo giá & điều chỉnh
    if "quoteVersions" in order_data:
        for qv in order_data["quoteVersions"]:
            qv_id = qv["id"]
            qv_res = await db.execute(select(QuoteVersion).filter(QuoteVersion.id == qv_id))
            db_qv = qv_res.scalars().first()
            
            expires_at = qv.get("expiresAt")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            else:
                expires_at = datetime.now(timezone.utc) + timedelta(days=3)
                
            if not db_qv:
                db_qv = QuoteVersion(
                    id=qv_id,
                    order_id=order_id,
                    version=qv["version"],
                    status=qv["status"],
                    subtotal=qv["subtotal"],
                    final_total=qv["finalTotal"],
                    deposit_amount=qv["depositAmount"],
                    cod_remaining=qv["codRemaining"],
                    shipping_fee_option=qv.get("shippingFeeOption", "included"),
                    expires_at=expires_at
                )
                db.add(db_qv)
            else:
                db_qv.status = qv["status"]
                db_qv.subtotal = qv["subtotal"]
                db_qv.final_total = qv["finalTotal"]
                db_qv.deposit_amount = qv["depositAmount"]
                db_qv.cod_remaining = qv["codRemaining"]
                db_qv.shipping_fee_option = qv.get("shippingFeeOption", db_qv.shipping_fee_option)
                db_qv.expires_at = expires_at
                
            await db.flush()
            
            if "adjustments" in qv:
                await db.execute(delete(QuoteAdjustment).where(QuoteAdjustment.quote_id == qv_id))
                for adj in qv["adjustments"]:
                    db_adj = QuoteAdjustment(
                        id=adj["id"],
                        quote_id=qv_id,
                        type=adj["type"],
                        label=adj["label"],
                        amount=adj["amount"],
                        requires_approval=adj.get("requiresApproval", False)
                    )
                    db.add(db_adj)
                    
    # 4. Yêu cầu thanh toán
    if "paymentRequests" in order_data:
        for pr in order_data["paymentRequests"]:
            pr_id = pr["id"]
            pr_res = await db.execute(select(PaymentRequest).filter(PaymentRequest.id == pr_id))
            db_pr = pr_res.scalars().first()
            
            expires_at = pr.get("expiresAt")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            else:
                expires_at = datetime.now(timezone.utc) + timedelta(days=3)
                
            if not db_pr:
                db_pr = PaymentRequest(
                    id=pr_id,
                    order_id=order_id,
                    quote_version=order_data["quoteVersions"][0]["version"] if order_data.get("quoteVersions") else 1,
                    purpose=pr["purpose"],
                    amount=pr["amount"],
                    reference=pr["reference"],
                    qr_payload=pr["qrPayload"],
                    status=pr["status"],
                    expires_at=expires_at
                )
                db.add(db_pr)
            else:
                db_pr.status = pr["status"]
                db_pr.amount = pr["amount"]
                db_pr.expires_at = expires_at
                
    # 5. Minh chứng thanh toán
    if "paymentProofs" in order_data:
        for pf in order_data["paymentProofs"]:
            pf_id = pf["id"]
            pf_res = await db.execute(select(PaymentProof).filter(PaymentProof.id == pf_id))
            db_pf = pf_res.scalars().first()
            
            if not db_pf:
                db_pf = PaymentProof(
                    id=pf_id,
                    order_id=order_id,
                    payment_request_id=pf["paymentRequestId"],
                    file_name=pf["fileName"],
                    status=pf["status"]
                )
                db.add(db_pf)
            else:
                db_pf.status = pf["status"]
                
    # 6. Bình luận
    if "comments" in order_data:
        for c in order_data["comments"]:
            c_id = c["id"]
            c_res = await db.execute(select(OrderComment).filter(OrderComment.id == c_id))
            db_c = c_res.scalars().first()
            
            created_at = c.get("createdAt")
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            else:
                created_at = datetime.now(timezone.utc)
                
            if not db_c:
                db_c = OrderComment(
                    id=c_id,
                    order_id=order_id,
                    author=c["author"],
                    audience=c["audience"],
                    message=c["message"],
                    created_at=created_at
                )
                db.add(db_c)
            else:
                db_c.message = c["message"]
                
    await db.commit()
    return {"status": "success", "message": "Lưu đơn sỉ thành công."}

@router.post("/calculate-financials", response_model=Dict[str, Any])
async def calculate_financials(payload: Dict[str, Any]):
    """
    Tính toán báo giá sỉ, áp dụng các điều chỉnh chiết khấu, VAT, phí vận chuyển.
    Đảm bảo tính toán BigInt chính xác chống làm tròn sai số.
    """
    items = payload.get("items", [])
    adjustments = payload.get("adjustments", [])
    payment_intent = payload.get("paymentIntent", "deposit_cod")
    deposit_rate_bps = payload.get("depositRateBps", 3000) # mặc định 30% = 3000 bps
    
    # 1. Tính Tạm tính (subtotal)
    subtotal = 0
    for item in items:
        subtotal += int(item["unitPriceSnapshot"]) * int(item["quantity"])
        
    # 2. Áp dụng điều chỉnh
    adjustment_total = 0
    applied_adjustments = []
    for adj in adjustments:
        amount = int(adj["amount"])
        # Loại trừ phí vận chuyển (cộng vào), các loại khác là chiết khấu (trừ đi)
        signed_amount = amount if adj["type"] == "shipping_fee" else -amount
        adjustment_total += signed_amount
        applied_adjustments.append({
            "id": adj["id"],
            "type": adj["type"],
            "label": adj["label"],
            "amount": amount,
            "signedAmount": signed_amount
        })
        
    final_total = subtotal + adjustment_total
    if final_total < 0:
        final_total = 0
        
    # 3. Tính tiền cọc và COD còn lại
    deposit_amount = final_total
    cod_remaining = 0
    if payment_intent == "deposit_cod":
        if "depositAmount" in payload and payload["depositAmount"] is not None:
            deposit_amount = int(payload["depositAmount"])
        else:
            deposit_amount = int((final_total * deposit_rate_bps) / 10000)
            
        if deposit_amount > final_total:
            deposit_amount = final_total
        cod_remaining = final_total - deposit_amount
        
    return {
        "subtotal": subtotal,
        "adjustmentTotal": adjustment_total,
        "finalTotal": final_total,
        "depositAmount": deposit_amount,
        "codRemaining": cod_remaining,
        "paymentDueNow": deposit_amount,
        "appliedAdjustments": applied_adjustments
    }
