import pytest

from app.core.config import settings
from app.services.payment import build_vietqr_image_url


def test_vietqr_url_uses_server_configuration_and_escapes_query(monkeypatch):
    monkeypatch.setattr(settings, "PAYMENT_QR_BANK_CODE", "MB")
    monkeypatch.setattr(settings, "PAYMENT_QR_ACCOUNT_NO", "0123456789")
    monkeypatch.setattr(settings, "PAYMENT_QR_ACCOUNT_NAME", "PET TRAVEL & WHOLESALE")

    result = build_vietqr_image_url(amount_vnd=123456, reference="ptw ref 1")

    assert result.startswith("https://img.vietqr.io/image/MB-0123456789-compact2.png?")
    assert "amount=123456" in result
    assert "addInfo=PTW+REF+1" in result
    assert "accountName=PET+TRAVEL+%26+WHOLESALE" in result


def test_vietqr_url_fails_closed_for_missing_account(monkeypatch):
    monkeypatch.setattr(settings, "PAYMENT_QR_ACCOUNT_NO", "")

    with pytest.raises(ValueError, match="PAYMENT_QR_CONFIGURATION_INVALID"):
        build_vietqr_image_url(amount_vnd=1000, reference="PTW-1")
