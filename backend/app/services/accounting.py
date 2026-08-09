from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime, timezone
from typing import Dict, Any, List
from app.models.wholesale import JournalEntry, JournalLine, Order, QuoteVersion, ProductVariant
import uuid

async def create_journal_entry(
    db: AsyncSession,
    description: str,
    source_type: str,
    source_id: str,
    lines: List[Dict[str, Any]],
    posted: bool = False
) -> JournalEntry:
    """
    Tạo bút toán mới. Kiểm tra tính cân bằng Nợ/Có.
    """
    debit_total = sum(line.get("debit_amount_vnd", 0) for line in lines)
    credit_total = sum(line.get("credit_amount_vnd", 0) for line in lines)
    
    if debit_total != credit_total:
        raise ValueError(f"Bút toán không cân bằng! Tổng Nợ ({debit_total}) khác Tổng Có ({credit_total}).")
        
    entry_id = f"je_{uuid.uuid4().hex[:12]}"
    time_suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    entry_no = f"JE-{source_type.upper()}-{time_suffix}"
    
    db_entry = JournalEntry(
        id=entry_id,
        entry_no=entry_no,
        description=description,
        status="posted" if posted else "draft",
        source_type=source_type,
        source_id=source_id,
        posted_at=datetime.utcnow() if posted else None
    )
    db.add(db_entry)
    await db.flush()
    
    for idx, line in enumerate(lines, 1):
        db_line = JournalLine(
            id=f"jl_{uuid.uuid4().hex[:12]}",
            entry_id=entry_id,
            line_no=idx,
            account_code=line["account_code"],
            account_name=line["account_name"],
            debit_amount_vnd=line.get("debit_amount_vnd", 0),
            credit_amount_vnd=line.get("credit_amount_vnd", 0),
            memo=line.get("memo"),
            order_id=line.get("order_id"),
            supplier_id=line.get("supplier_id"),
            partner_org_id=line.get("partner_org_id")
        )
        db.add(db_line)
        
    await db.flush()
    return db_entry

async def post_order_deposit_receipt(order_id: str, db: AsyncSession) -> JournalEntry:
    """
    Sinh bút toán nhận tiền cọc sỉ 30% qua ngân hàng (VietQR).
    Hạch toán: Nợ 112 (Tiền gửi ngân hàng) / Có 131 (Phải thu đại lý).
    """
    # Lấy thông tin đơn hàng
    ord_res = await db.execute(select(Order).filter(Order.id == order_id))
    order = ord_res.scalars().first()
    if not order:
        raise ValueError("Đơn hàng không tồn tại.")
        
    # Lấy báo giá cuối cùng
    quote_res = await db.execute(
        select(QuoteVersion)
        .filter(QuoteVersion.order_id == order_id)
        .order_by(QuoteVersion.version.desc())
    )
    quote = quote_res.scalars().first()
    if not quote:
        raise ValueError("Đơn hàng chưa có báo giá chính thức.")
        
    deposit_amount = quote.deposit_amount
    
    lines = [
        {
            "account_code": "112",
            "account_name": "Tiền gửi ngân hàng (MB Bank VietQR sỉ)",
            "debit_amount_vnd": deposit_amount,
            "credit_amount_vnd": 0,
            "memo": f"Nhận tiền đặt cọc đơn sỉ {order.number} qua VietQR.",
            "order_id": order_id
        },
        {
            "account_code": "131",
            "account_name": "Phải thu khách hàng (Đại lý sỉ)",
            "debit_amount_vnd": 0,
            "credit_amount_vnd": deposit_amount,
            "memo": f"Khấu trừ công nợ cọc đơn sỉ {order.number}.",
            "order_id": order_id,
            "partner_org_id": order.customer_id
        }
    ]
    
    return await create_journal_entry(
        db,
        description=f"Nhận cọc 30% đơn sỉ {order.number} từ đối tác {order.customer_name}.",
        source_type="order",
        source_id=order_id,
        lines=lines,
        posted=True # Ghi sổ ngay lập tức khi bank khớp tiền
    )

async def post_order_sales_and_cost(order_id: str, db: AsyncSession) -> List[JournalEntry]:
    """
    Sinh bút toán ghi nhận doanh thu sỉ và giá vốn hàng bán khi xuất kho.
    1. Bút toán doanh thu: Nợ 131 (Phải thu đại lý) / Có 511 (Doanh thu bán hàng sỉ).
    2. Bút toán giá vốn: Nợ 632 (Giá vốn) / Có 156 (Hàng hóa kho).
    """
    ord_res = await db.execute(select(Order).filter(Order.id == order_id))
    order = ord_res.scalars().first()
    if not order:
        raise ValueError("Đơn hàng không tồn tại.")
        
    quote_res = await db.execute(
        select(QuoteVersion)
        .filter(QuoteVersion.order_id == order_id)
        .order_by(QuoteVersion.version.desc())
    )
    quote = quote_res.scalars().first()
    if not quote:
        raise ValueError("Đơn hàng chưa có báo giá chính thức.")
        
    # Tính tổng giá vốn thực tế dựa vào giá vốn sỉ snapshot tại thời điểm bán (ở đây giả lập 65% wholesale_price)
    cost_total = 0
    for item in order.items:
        cost_total += int(item.quantity * item.unit_price_snapshot * 0.65)
        
    entries = []
    
    # 1. Bút toán Doanh thu sỉ
    revenue_lines = [
        {
            "account_code": "131",
            "account_name": "Phải thu khách hàng (Đại lý sỉ)",
            "debit_amount_vnd": quote.final_total,
            "credit_amount_vnd": 0,
            "memo": f"Phát sinh phải thu đại lý đơn sỉ {order.number}.",
            "order_id": order_id,
            "partner_org_id": order.customer_id
        },
        {
            "account_code": "511",
            "account_name": "Doanh thu bán hàng sỉ và cung cấp dịch vụ",
            "debit_amount_vnd": 0,
            "credit_amount_vnd": quote.final_total,
            "memo": f"Ghi nhận doanh thu sỉ đơn {order.number}.",
            "order_id": order_id
        }
    ]
    je_rev = await create_journal_entry(
        db,
        description=f"Ghi nhận doanh thu sỉ đơn hàng {order.number}.",
        source_type="order",
        source_id=order_id,
        lines=revenue_lines,
        posted=True
    )
    entries.append(je_rev)
    
    # 2. Bút toán Giá vốn hàng bán
    cost_lines = [
        {
            "account_code": "632",
            "account_name": "Giá vốn hàng bán sỉ",
            "debit_amount_vnd": cost_total,
            "credit_amount_vnd": 0,
            "memo": f"Hạch toán giá vốn đơn sỉ {order.number}.",
            "order_id": order_id
        },
        {
            "account_code": "156",
            "account_name": "Hàng hóa kho PetTravel Wholesale",
            "debit_amount_vnd": 0,
            "credit_amount_vnd": cost_total,
            "memo": f"Xuất kho hàng sỉ đơn {order.number}.",
            "order_id": order_id
        }
    ]
    je_cost = await create_journal_entry(
        db,
        description=f"Hạch toán xuất kho giá vốn hàng sỉ đơn {order.number}.",
        source_type="order",
        source_id=order_id,
        lines=cost_lines,
        posted=True
    )
    entries.append(je_cost)
    
    return entries
