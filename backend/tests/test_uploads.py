import pytest
from fastapi import HTTPException

from app.routers.v1.endpoints.uploads import (
    PresignUploadInput,
    create_presigned_upload_url,
    sanitize_path_part,
    get_file_extension,
)


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
    monkeypatch.setattr(settings, "R2_PUBLIC_BASE_URL", "https://pub-test.r2.dev")

    # Mock boto3 s3_client
    class MockS3Client:
        def generate_presigned_url(self, client_method, Params, ExpiresIn):
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
