import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy.future import select
from app.models.wholesale import Order, OrderItem, QuoteVersion, Supplier, User, Product, ProductVariant, JournalLine
from app.services.accounting import create_journal_entry, post_order_deposit_receipt, post_order_sales_and_cost

@pytest.mark.asyncio
async def test_create_journal_entry_balance_check(db_session):
    # Thử tạo bút toán bị lệch (Nợ 100k, Có 90k) -> Phải ném lỗi ValueError
    lines = [
        {"account_code": "112", "account_name": "Tiền gửi", "debit_amount_vnd": 100000},
        {"account_code": "131", "account_name": "Phải thu sỉ", "credit_amount_vnd": 90000}
    ]
    
    with pytest.raises(ValueError) as excinfo:
        await create_journal_entry(
            db_session,
            description="Thử bút toán lệch",
            source_type="order",
            source_id="ord_test",
            lines=lines
        )
    assert "Bút toán không cân bằng" in str(excinfo.value)
    
    # Thử tạo bút toán cân (Nợ 100k, Có 100k) -> Thành công
    lines_balanced = [
        {"account_code": "112", "account_name": "Tiền gửi", "debit_amount_vnd": 100000},
        {"account_code": "131", "account_name": "Phải thu sỉ", "credit_amount_vnd": 100000}
    ]
    entry = await create_journal_entry(
        db_session,
        description="Bút toán cân",
        source_type="order",
        source_id="ord_test",
        lines=lines_balanced
    )
    assert entry.status == "draft"
    assert entry.entry_no.startswith("JE-ORDER-")

@pytest.mark.asyncio
async def test_order_deposit_receipt_posting(db_session):
    # 1. Chuẩn bị đơn hàng và báo giá tương thích
    user = User(id="u_demo", email="demo@pettravel.vn", name="Demo Client", hashed_password="...")
    db_session.add(user)
    
    order = Order(
        id="ord_1",
        number="PTW-260810-XYZ",
        customer_name="Demo Client",
        customer_company="Demo Company",
        customer_id="u_demo",
        commercial_status="submitted",
        payment_status="unrequested"
    )
    db_session.add(order)
    
    quote = QuoteVersion(
        id="q_1",
        order_id="ord_1",
        version=1,
        status="published",
        subtotal=10000000,
        final_total=10000000,
        deposit_amount=3000000, # cọc 30%
        cod_remaining=7000000,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1)
    )
    db_session.add(quote)
    await db_session.commit()
    
    # 2. Hạch toán cọc tiền
    entry = await post_order_deposit_receipt("ord_1", db_session)
    
    # 3. Xác minh tính cân bằng và nội dung hạch toán bằng cách select async lines
    assert entry.status == "posted"
    
    result = await db_session.execute(
        select(JournalLine).filter(JournalLine.entry_id == entry.id).order_by(JournalLine.line_no)
    )
    lines = result.scalars().all()
    assert len(lines) == 2
    
    # Dòng 1: Nợ 112 (Tiền gửi) - 3.000.000
    assert lines[0].account_code == "112"
    assert lines[0].debit_amount_vnd == 3000000
    assert lines[0].credit_amount_vnd == 0
    
    # Dòng 2: Có 131 (Phải thu đại lý sỉ) - 3.000.000
    assert lines[1].account_code == "131"
    assert lines[1].debit_amount_vnd == 0
    assert lines[1].credit_amount_vnd == 3000000
