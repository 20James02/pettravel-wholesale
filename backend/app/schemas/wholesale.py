from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

# --- USER SCHEMAS ---
class UserBase(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None
    role: str = "customer_owner"
    company: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=12)

class UserResponse(UserBase):
    id: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# --- SUPPLIER SCHEMAS ---
class SupplierBase(BaseModel):
    code: str
    name: str
    lead_time_days: int = 3
    is_admin_only: bool = False

class SupplierCreate(SupplierBase):
    pass

class SupplierResponse(SupplierBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- PRODUCT VARIANT SCHEMAS ---
class VariantBase(BaseModel):
    sku: str
    label: str
    wholesale_price: int
    min_order_qty: int = 1
    stock: int = 0
    supplier_id: Optional[str] = None
    image_url: Optional[str] = None

class VariantCreate(VariantBase):
    pass

class VariantResponse(VariantBase):
    product_code: str

    class Config:
        from_attributes = True

# --- PRODUCT SCHEMAS ---
class ProductBase(BaseModel):
    code: str
    name: str
    category: str
    brand: Optional[str] = None
    image_url: Optional[str] = None
    images: List[str] = []
    dimensions: Optional[str] = None
    weight: float = 0.0
    description: Optional[str] = None
    tags: Optional[str] = None

class ProductCreate(ProductBase):
    variants: List[VariantCreate] = []

class ProductResponse(ProductBase):
    created_at: datetime
    variants: List[VariantResponse] = []

    class Config:
        from_attributes = True

# --- ORDER ITEM SCHEMAS ---
class OrderItemCreate(BaseModel):
    productCode: str
    productName: str
    variantSku: str
    variantLabel: str
    quantity: int
    unitPriceSnapshot: int
    supplierId: Optional[str] = None

class OrderItemResponse(BaseModel):
    id: str
    order_id: str
    product_code: str
    product_name: str
    variant_sku: str
    variant_label: str
    quantity: int
    unit_price_snapshot: int
    supplier_id: str

    class Config:
        from_attributes = True

# --- ORDER SCHEMAS ---
class OrderCreate(BaseModel):
    items: List[OrderItemCreate]
    recipientName: Optional[str] = None
    recipientPhone: Optional[str] = None
    recipientAddress: Optional[str] = None
    paymentIntent: Optional[str] = "deposit_cod"
    customerId: Optional[str] = None

class OrderResponse(BaseModel):
    id: str
    number: str
    customer_name: str
    customer_company: Optional[str] = None
    customer_id: str
    commercial_status: str
    payment_status: str
    fulfillment_status: str
    payment_intent: str
    recipient_name: Optional[str] = None
    recipient_phone: Optional[str] = None
    recipient_address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- QUOTE SCHEMAS ---
class QuoteVersionResponse(BaseModel):
    id: str
    order_id: str
    version: int
    status: str
    subtotal: int
    final_total: int
    deposit_amount: int
    cod_remaining: int
    shipping_fee_option: str
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True

# --- RESERVATION SCHEMAS ---
class StockReservationResponse(BaseModel):
    id: str
    order_id: str
    variant_sku: str
    quantity: int
    status: str
    reason: Optional[str] = None
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True

# --- JOURNAL SCHEMAS ---
class JournalLineResponse(BaseModel):
    id: str
    line_no: int
    account_code: str
    account_name: str
    debit_amount_vnd: int
    credit_amount_vnd: int
    memo: Optional[str] = None
    order_id: Optional[str] = None
    supplier_id: Optional[str] = None
    partner_org_id: Optional[str] = None

    class Config:
        from_attributes = True

class JournalEntryResponse(BaseModel):
    id: str
    entry_no: str
    description: str
    status: str
    source_type: str
    source_id: str
    created_at: datetime
    posted_at: Optional[datetime] = None
    lines: List[JournalLineResponse] = []

    class Config:
        from_attributes = True
