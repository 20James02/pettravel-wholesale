from pydantic import BaseModel, ConfigDict, Field


class PromotionsPolicy(BaseModel):
    """Authoritative persisted pricing controls used by quote workflows."""

    model_config = ConfigDict(extra="forbid")

    freeShippingThreshold: int = Field(ge=0, le=10_000_000_000)
    defaultDepositRate: float = Field(ge=0, le=1)
    maxOperatorDiscountRate: float = Field(ge=0, le=1)
    requireManagerApprovalAbove: int = Field(ge=0, le=10_000_000_000)


DEFAULT_PROMOTIONS_POLICY = PromotionsPolicy(
    freeShippingThreshold=5_000_000,
    defaultDepositRate=0.3,
    maxOperatorDiscountRate=0.08,
    requireManagerApprovalAbove=500_000,
)
