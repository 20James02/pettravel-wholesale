from sqlalchemy import Column, String, Integer, Float, Boolean, ForeignKey, DateTime, JSON, Text
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone

Base = declarative_base()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    role = Column(String, default="customer_owner") # super_admin, operator, accountant, customer_owner
    company = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

class Product(Base):
    __tablename__ = "products"
    
    code = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    brand = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    images = Column(JSON, default=list) # List of image URLs
    dimensions = Column(String, nullable=True)
    weight = Column(Float, default=0.0)
    description = Column(Text, nullable=True)
    tags = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")

class ProductVariant(Base):
    __tablename__ = "product_variants"
    
    sku = Column(String, primary_key=True, index=True)
    product_code = Column(String, ForeignKey("products.code"), nullable=False)
    label = Column(String, nullable=False)
    wholesale_price = Column(Integer, nullable=False)
    min_order_qty = Column(Integer, default=1)
    stock = Column(Integer, default=0)
    supplier_id = Column(String, ForeignKey("suppliers.id"), nullable=True)
    image_url = Column(String, nullable=True)
    
    product = relationship("Product", back_populates="variants")
    supplier = relationship("Supplier")

class Supplier(Base):
    __tablename__ = "suppliers"
    
    id = Column(String, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    lead_time_days = Column(Integer, default=3)
    is_admin_only = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)


# --- BUSINESS LOGIC MODELS: ORDERS, PAYMENTS, ACCOUNTING, INVENTORY RESERVATION ---

class Order(Base):
    __tablename__ = "orders"
    
    id = Column(String, primary_key=True, index=True)
    number = Column(String, unique=True, index=True, nullable=False)
    customer_name = Column(String, nullable=False)
    customer_company = Column(String, nullable=False)
    customer_id = Column(String, ForeignKey("users.id"), nullable=False)
    assigned_staff_id = Column(String, ForeignKey("users.id"), nullable=True)
    assigned_staff_name = Column(String, nullable=True)
    
    commercial_status = Column(String, default="draft") # draft, submitted, quoted, customer_accepted, locked, completed
    payment_status = Column(String, default="unrequested") # unrequested, deposit_uploaded, deposit_confirmed, full_uploaded, paid
    fulfillment_status = Column(String, default="not_started") # not_started, shipped, partial, completed
    payment_intent = Column(String, default="deposit_cod") # deposit_cod, pay_full
    invoice_requested = Column(Boolean, default=False)
    
    recipient_name = Column(String, nullable=True)
    recipient_phone = Column(String, nullable=True)
    recipient_address = Column(String, nullable=True)
    
    shipment_carrier = Column(String, nullable=True)
    shipment_tracking_code = Column(String, nullable=True)
    shipment_fee = Column(Integer, default=0)
    shipment_eta = Column(String, nullable=True)
    shipment_note = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    quotes = relationship("QuoteVersion", back_populates="order", cascade="all, delete-orphan")
    payment_requests = relationship("PaymentRequest", back_populates="order", cascade="all, delete-orphan")
    payment_proofs = relationship("PaymentProof", back_populates="order", cascade="all, delete-orphan")
    comments = relationship("OrderComment", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"
    
    id = Column(String, primary_key=True, index=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    product_code = Column(String, nullable=False)
    product_name = Column(String, nullable=False)
    variant_sku = Column(String, ForeignKey("product_variants.sku"), nullable=False)
    variant_label = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price_snapshot = Column(Integer, nullable=False)
    supplier_id = Column(String, nullable=False)
    
    order = relationship("Order", back_populates="items")

class QuoteVersion(Base):
    __tablename__ = "quote_versions"
    
    id = Column(String, primary_key=True, index=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    version = Column(Integer, nullable=False)
    status = Column(String, default="published") # draft, published, accepted, superseded
    subtotal = Column(Integer, nullable=False)
    final_total = Column(Integer, nullable=False)
    deposit_amount = Column(Integer, nullable=False)
    cod_remaining = Column(Integer, nullable=False)
    shipping_fee_option = Column(String, default="included") # included, separate_cod
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    
    order = relationship("Order", back_populates="quotes")
    adjustments = relationship("QuoteAdjustment", back_populates="quote", cascade="all, delete-orphan")

class QuoteAdjustment(Base):
    __tablename__ = "quote_adjustments"
    
    id = Column(String, primary_key=True, index=True)
    quote_id = Column(String, ForeignKey("quote_versions.id"), nullable=False)
    type = Column(String, nullable=False) # discount, free_shipping, offer, shipping_fee
    label = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)
    requires_approval = Column(Boolean, default=False)
    
    quote = relationship("QuoteVersion", back_populates="adjustments")

class PaymentRequest(Base):
    __tablename__ = "payment_requests"
    
    id = Column(String, primary_key=True, index=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    quote_version = Column(Integer, nullable=False)
    amount = Column(Integer, nullable=False)
    purpose = Column(String, nullable=False) # deposit, full
    reference = Column(String, unique=True, index=True, nullable=False)
    qr_payload = Column(String, nullable=False)
    status = Column(String, default="active") # active, superseded, paid, expired
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    
    order = relationship("Order", back_populates="payment_requests")

class PaymentProof(Base):
    __tablename__ = "payment_proofs"
    
    id = Column(String, primary_key=True, index=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    payment_request_id = Column(String, ForeignKey("payment_requests.id"), nullable=False)
    file_name = Column(String, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), default=utc_now)
    status = Column(String, default="pending_admin_confirmation") # pending_admin_confirmation, accepted, rejected
    
    order = relationship("Order", back_populates="payment_proofs")

class OrderComment(Base):
    __tablename__ = "order_comments"
    
    id = Column(String, primary_key=True, index=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    author = Column(String, nullable=False)
    audience = Column(String, nullable=False) # customer_visible, internal
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    
    order = relationship("Order", back_populates="comments")

class StockReservation(Base):
    __tablename__ = "stock_reservations"
    
    id = Column(String, primary_key=True, index=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    variant_sku = Column(String, ForeignKey("product_variants.sku"), nullable=False)
    quantity = Column(Integer, nullable=False)
    status = Column(String, default="reserved") # reserved, released, expired, consumed
    reason = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

class JournalEntry(Base):
    __tablename__ = "journal_entries"
    
    id = Column(String, primary_key=True, index=True)
    entry_no = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=False)
    status = Column(String, default="draft") # draft, posted, void
    source_type = Column(String, nullable=False) # order, purchase, adjustment, expense
    source_id = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    posted_at = Column(DateTime, nullable=True)
    
    lines = relationship("JournalLine", back_populates="entry", cascade="all, delete-orphan")

class JournalLine(Base):
    __tablename__ = "journal_lines"
    
    id = Column(String, primary_key=True, index=True)
    entry_id = Column(String, ForeignKey("journal_entries.id"), nullable=False)
    line_no = Column(Integer, nullable=False)
    account_code = Column(String, nullable=False) # e.g. 111, 112, 131, 156, 331, 511, 632
    account_name = Column(String, nullable=False)
    debit_amount_vnd = Column(Integer, default=0)
    credit_amount_vnd = Column(Integer, default=0)
    memo = Column(String, nullable=True)
    order_id = Column(String, nullable=True)
    supplier_id = Column(String, nullable=True)
    partner_org_id = Column(String, nullable=True)
    
    entry = relationship("JournalEntry", back_populates="lines")
class AppSetting(Base):
    __tablename__ = "app_settings"
    
    key = Column(String, primary_key=True, index=True)
    value = Column(JSON, nullable=False)

class AccountingPeriod(Base):
    __tablename__ = "accounting_periods"
    
    id = Column(String, primary_key=True, index=True)
    organization_id = Column(String, nullable=True)
    status = Column(String, default="open") # open, closed
