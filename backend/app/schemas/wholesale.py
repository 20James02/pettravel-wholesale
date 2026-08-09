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
