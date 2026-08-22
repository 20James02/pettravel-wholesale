import pytest
from pydantic import ValidationError

from app.schemas.policy import DEFAULT_PROMOTIONS_POLICY, PromotionsPolicy


def test_default_promotions_policy_is_complete_and_valid():
    assert DEFAULT_PROMOTIONS_POLICY.model_dump() == {
        "freeShippingThreshold": 5_000_000,
        "defaultDepositRate": 0.3,
        "maxOperatorDiscountRate": 0.08,
        "requireManagerApprovalAbove": 500_000,
    }


@pytest.mark.parametrize(
    "field,value",
    [
        ("freeShippingThreshold", -1),
        ("defaultDepositRate", 1.01),
        ("maxOperatorDiscountRate", -0.01),
        ("requireManagerApprovalAbove", -1),
    ],
)
def test_promotions_policy_rejects_out_of_range_values(field, value):
    payload = DEFAULT_PROMOTIONS_POLICY.model_dump()
    payload[field] = value

    with pytest.raises(ValidationError):
        PromotionsPolicy.model_validate(payload)


def test_promotions_policy_rejects_missing_and_unknown_fields():
    missing = DEFAULT_PROMOTIONS_POLICY.model_dump()
    missing.pop("defaultDepositRate")
    with pytest.raises(ValidationError):
        PromotionsPolicy.model_validate(missing)

    extra = DEFAULT_PROMOTIONS_POLICY.model_dump()
    extra["fabricatedTier"] = {"discountPercent": 99}
    with pytest.raises(ValidationError):
        PromotionsPolicy.model_validate(extra)
