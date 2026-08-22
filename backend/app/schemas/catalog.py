from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class GuestVariantDTO(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    sku: str
    label: str
    barcode: Optional[str] = None
    imageUrl: Optional[str] = None
    stock: int = 0


class CustomerVariantDTO(GuestVariantDTO):
    wholesalePrice: int = Field(..., ge=0)
    minOrderQty: int = Field(1, ge=1)


class AdminVariantDTO(CustomerVariantDTO):
    supplierId: str


class ProductDTO(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    code: str
    name: str
    brand: str = "Pet Travel"
    category: str
    description: Optional[str] = None
    imageUrl: Optional[str] = None
    images: List[str] = Field(default_factory=list)
    dimensions: Optional[str] = None
    weight: float = 0.0
    tags: List[str] = Field(default_factory=list)
    variants: List[Any] = Field(default_factory=list)
