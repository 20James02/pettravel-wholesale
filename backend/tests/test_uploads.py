import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.routers.v1.endpoints.uploads import (
    PrivateObjectInput,
    PresignUploadInput,
    VerifyPrivateUploadInput,
    create_private_download_url,
    create_presigned_upload_url,
    validate_private_storage_key,
    verify_private_upload,
    sanitize_path_part,
    get_file_extension,
)
from app.core.internal_auth import is_public_api_path
from app.core.config import settings
from app.main import app


def test_presign_endpoint_requires_internal_authentication():
    assert not is_public_api_path("/api/v1/uploads/presign", "POST")


def test_direct_presign_request_without_internal_secret_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "BACKEND_INTERNAL_SECRET", "test-internal-secret-32-characters-long")
    response = TestClient(app).post(
        "/api/v1/uploads/presign",
        json={
            "purpose": "payment-proof",
            "fileName": "proof.jpg",
            "contentType": "image/jpeg",
            "fileSizeBytes": 100,
            "orderId": "ord-test",
        },
    )
    assert response.status_code == 401


def test_sanitize_path_part_prevents_path_traversal():
    assert sanitize_path_part("../../etc/passwd") == "etc-passwd"
    assert sanitize_path_part("..\\..\\windows\\system32") == "windows-system32"
    assert sanitize_path_part("product/sub/name?query=1") == "product-sub-name-query-1"
    assert sanitize_path_part("!!!___HELLO___???") == "hello"
    assert sanitize_path_part("", default="new") == "new"
    assert sanitize_path_part("   ", default="general") == "general"


def test_get_file_extension():
    assert get_file_extension("photo.JPEG", "image/jpeg") == "jpg"
    assert get_file_extension("banner.png", "image/png") == "png"
    assert get_file_extension("item.webp", "image/webp") == "webp"
    assert get_file_extension("icon.avif", "image/avif") == "avif"
    assert get_file_extension("doc.pdf", "application/pdf") == "pdf"


@pytest.mark.asyncio
async def test_presign_rejects_unsupported_mime():
    with pytest.raises(HTTPException) as exc_info:
        await create_presigned_upload_url(
            PresignUploadInput(
                purpose="product-image",
                fileName="malicious.exe",
                contentType="application/x-msdownload",
                fileSizeBytes=1024,
            )
        )
    assert exc_info.value.status_code == 400
    assert "Định dạng tệp không được hỗ trợ" in exc_info.value.detail


@pytest.mark.asyncio
async def test_presign_rejects_pdf_for_product_media():
    with pytest.raises(HTTPException) as exc_info:
        await create_presigned_upload_url(
            PresignUploadInput(
                purpose="product-image",
                fileName="catalog.pdf",
                contentType="application/pdf",
                fileSizeBytes=1024,
                productId="prod_123",
            )
        )
    assert exc_info.value.status_code == 400
    assert "chỉ chấp nhận định dạng ảnh" in exc_info.value.detail


def test_presign_rejects_unknown_purpose():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        PresignUploadInput(
            purpose="arbitrary-public-upload",
            fileName="file.pdf",
            contentType="application/pdf",
            fileSizeBytes=100,
        )


def test_presign_rejects_oversized_file():
    from pydantic import ValidationError

    with pytest.raises(ValidationError) as exc_info:
        PresignUploadInput(
            purpose="product-image",
            fileName="large_photo.jpg",
            contentType="image/jpeg",
            fileSizeBytes=15 * 1024 * 1024,  # 15MB > 10MB limit
        )
    assert "fileSizeBytes" in str(exc_info.value)


@pytest.mark.asyncio
async def test_presign_generates_valid_keys_when_configured(monkeypatch):
    # Mock settings with dummy test credentials
    from app.core.config import settings
    monkeypatch.setattr(settings, "R2_ACCOUNT_ID", "test_account")
    monkeypatch.setattr(settings, "R2_ACCESS_KEY_ID", "test_access_key")
    monkeypatch.setattr(settings, "R2_SECRET_ACCESS_KEY", "test_secret_key")
    monkeypatch.setattr(settings, "R2_BUCKET", "test_bucket")
    monkeypatch.setattr(settings, "R2_PRIVATE_BUCKET", "test_private_bucket")
    monkeypatch.setattr(settings, "R2_PUBLIC_BASE_URL", "https://pub-test.r2.dev")

    # Mock boto3 s3_client
    calls = []

    class MockS3Client:
        def generate_presigned_url(self, client_method, Params, ExpiresIn):
            calls.append((client_method, Params, ExpiresIn))
            return f"https://test_account.r2.cloudflarestorage.com/{Params['Bucket']}/{Params['Key']}?sig=mock"

    import boto3
    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: MockS3Client())

    # Test Product Image Presign
    res_product = await create_presigned_upload_url(
        PresignUploadInput(
            purpose="product-image",
            fileName="backpack.jpg",
            contentType="image/jpeg",
            fileSizeBytes=500_000,
            productId="prod_123",
        )
    )
    assert res_product["key"].startswith("products/prod_123/")
    assert res_product["key"].endswith(".jpg")
    assert res_product["publicUrl"].startswith("https://pub-test.r2.dev/products/prod_123/")
    assert res_product["expiresInSeconds"] == 300
    assert calls[-1][1]["ContentLength"] == 500_000

    # Test Variant Image Presign
    res_variant = await create_presigned_upload_url(
        PresignUploadInput(
            purpose="variant-image",
            fileName="blue_var.png",
            contentType="image/png",
            fileSizeBytes=200_000,
            productId="prod_123",
            variantId="var_blue",
        )
    )
    assert res_variant["key"].startswith("variants/prod_123/var_blue/")
    assert res_variant["key"].endswith(".png")
    assert res_variant["publicUrl"].startswith("https://pub-test.r2.dev/variants/prod_123/var_blue/")

    res_proof = await create_presigned_upload_url(
        PresignUploadInput(
            purpose="payment-proof",
            fileName="transfer.pdf",
            contentType="application/pdf",
            fileSizeBytes=321_000,
            orderId="ord_123",
        )
    )
    assert res_proof["key"].startswith("orders/ord_123/payment-proof/")
    assert res_proof["publicUrl"] is None
    assert calls[-1][1]["Bucket"] == "test_private_bucket"
    assert calls[-1][1]["ContentLength"] == 321_000


def test_private_key_must_belong_to_order_and_purpose():
    validate_private_storage_key(
        "ord_123",
        "payment-proof",
        "orders/ord_123/payment-proof/abc123.jpg",
    )
    with pytest.raises(HTTPException, match="Storage key does not belong"):
        validate_private_storage_key(
            "ord_123",
            "payment-proof",
            "orders/ord_other/payment-proof/abc123.jpg",
        )
    with pytest.raises(HTTPException, match="Storage key does not belong"):
        validate_private_storage_key(
            "ord_123",
            "payment-proof",
            "orders/ord_123/invoice/abc123.pdf",
        )


@pytest.mark.asyncio
async def test_private_upload_is_head_verified_before_metadata_is_accepted(monkeypatch):
    monkeypatch.setattr(settings, "R2_ACCOUNT_ID", "test_account")
    monkeypatch.setattr(settings, "R2_ACCESS_KEY_ID", "test_access_key")
    monkeypatch.setattr(settings, "R2_SECRET_ACCESS_KEY", "test_secret_key")
    monkeypatch.setattr(settings, "R2_PRIVATE_BUCKET", "test_private_bucket")

    class MockS3Client:
        def head_object(self, Bucket, Key):
            assert Bucket == "test_private_bucket"
            assert Key == "orders/ord_123/payment-proof/abc123.jpg"
            return {"ContentLength": 1234, "ContentType": "image/jpeg"}

    import boto3
    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: MockS3Client())

    result = await verify_private_upload(
        VerifyPrivateUploadInput(
            purpose="payment-proof",
            orderId="ord_123",
            storageKey="orders/ord_123/payment-proof/abc123.jpg",
            contentType="image/jpeg",
            fileSizeBytes=1234,
        )
    )
    assert result == {"verified": True}

    with pytest.raises(HTTPException, match="metadata does not match"):
        await verify_private_upload(
            VerifyPrivateUploadInput(
                purpose="payment-proof",
                orderId="ord_123",
                storageKey="orders/ord_123/payment-proof/abc123.jpg",
                contentType="image/jpeg",
                fileSizeBytes=999,
            )
        )


@pytest.mark.asyncio
async def test_private_download_uses_short_lived_private_bucket_url(monkeypatch):
    monkeypatch.setattr(settings, "R2_ACCOUNT_ID", "test_account")
    monkeypatch.setattr(settings, "R2_ACCESS_KEY_ID", "test_access_key")
    monkeypatch.setattr(settings, "R2_SECRET_ACCESS_KEY", "test_secret_key")
    monkeypatch.setattr(settings, "R2_PRIVATE_BUCKET", "test_private_bucket")
    captured = {}

    class MockS3Client:
        def generate_presigned_url(self, client_method, Params, ExpiresIn):
            captured.update(method=client_method, params=Params, expires=ExpiresIn)
            return "https://test_account.r2.cloudflarestorage.com/private?sig=mock"

    import boto3
    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: MockS3Client())

    result = await create_private_download_url(
        PrivateObjectInput(
            purpose="payment-proof",
            orderId="ord_123",
            storageKey="orders/ord_123/payment-proof/abc123.jpg",
        )
    )
    assert result["expiresInSeconds"] == 60
    assert captured["method"] == "get_object"
    assert captured["params"]["Bucket"] == "test_private_bucket"
    assert captured["params"]["ResponseContentDisposition"] == "attachment"
