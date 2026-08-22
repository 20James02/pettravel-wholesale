from __future__ import annotations

import re
from urllib.parse import urlencode

from app.core.config import settings


_BANK_CODE_PATTERN = re.compile(r"^[A-Z0-9]{2,16}$")
_ACCOUNT_NO_PATTERN = re.compile(r"^[A-Z0-9]{4,32}$")


def build_vietqr_image_url(*, amount_vnd: int, reference: str) -> str:
    """Build an authoritative VietQR image URL from server-only configuration."""
    bank_code = settings.PAYMENT_QR_BANK_CODE.strip().upper()
    account_no = settings.PAYMENT_QR_ACCOUNT_NO.strip().upper()
    account_name = settings.PAYMENT_QR_ACCOUNT_NAME.strip()
    normalized_reference = reference.strip().upper()

    if not _BANK_CODE_PATTERN.fullmatch(bank_code):
        raise ValueError("PAYMENT_QR_CONFIGURATION_INVALID: PAYMENT_QR_BANK_CODE không hợp lệ.")
    if not _ACCOUNT_NO_PATTERN.fullmatch(account_no):
        raise ValueError("PAYMENT_QR_CONFIGURATION_INVALID: PAYMENT_QR_ACCOUNT_NO không hợp lệ.")
    if not account_name or len(account_name) > 100:
        raise ValueError("PAYMENT_QR_CONFIGURATION_INVALID: PAYMENT_QR_ACCOUNT_NAME không hợp lệ.")
    if amount_vnd <= 0 or not normalized_reference:
        raise ValueError("PAYMENT_QR_INPUT_INVALID: Số tiền và mã tham chiếu phải hợp lệ.")

    query = urlencode(
        {
            "amount": amount_vnd,
            "addInfo": normalized_reference,
            "accountName": account_name,
        }
    )
    return f"https://img.vietqr.io/image/{bank_code}-{account_no}-compact2.png?{query}"
