from pydantic import BaseModel, ConfigDict, EmailStr, Field
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
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    created_at: datetime

# --- SUPPLIER SCHEMAS ---
class SupplierBase(BaseModel):
    code: str
    name: str
    lead_time_days: int = 3
    is_admin_only: bool = False

class SupplierCreate(SupplierBase):
    pass

class SupplierResponse(SupplierBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime

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
    model_config = ConfigDict(from_attributes=True)

    product_code: str

# --- PRODUCT SCHEMAS ---
class ProductBase(BaseModel):
    code: str
    name: str
    category: str
    brand: Optional[str] = None
    image_url: Optional[str] = None
    images: List[str] = Field(default_factory=list)
    dimensions: Optional[str] = None
    weight: float = 0.0
    description: Optional[str] = None
    tags: Optional[str] = None

class ProductCreate(ProductBase):
    variants: List[VariantCreate] = Field(default_factory=list)

class ProductResponse(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    created_at: datetime
    variants: List[VariantResponse] = Field(default_factory=list)

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
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_id: str
    product_code: str
    product_name: str
    variant_sku: str
    variant_label: str
    quantity: int
    unit_price_snapshot: int
    supplier_id: str

# --- ORDER SCHEMAS ---
class OrderCreate(BaseModel):
    items: List[OrderItemCreate]
    recipientName: Optional[str] = None
    recipientPhone: Optional[str] = None
    recipientAddress: Optional[str] = None
    paymentIntent: Optional[str] = "deposit_cod"
    customerId: Optional[str] = None

class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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

# --- QUOTE SCHEMAS ---
class QuoteVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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

# --- RESERVATION SCHEMAS ---
class StockReservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_id: str
    variant_sku: str
    quantity: int
    status: str
    reason: Optional[str] = None
    expires_at: datetime
    created_at: datetime

# --- JOURNAL SCHEMAS ---
class JournalLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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

class JournalEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    entry_no: str
    description: str
    status: str
    source_type: str
    source_id: str
    created_at: datetime
    posted_at: Optional[datetime] = None
    lines: List[JournalLineResponse] = Field(default_factory=list)
