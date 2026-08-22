import logging
import re
import uuid
from typing import Any, Dict, Literal, Optional

import boto3
from botocore.config import Config
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from app.core.config import settings


router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "application/pdf": "pdf",
}
IMAGE_CONTENT_TYPES = {content_type for content_type in ALLOWED_CONTENT_TYPES if content_type.startswith("image/")}
PRIVATE_UPLOAD_PURPOSES = {"payment-proof", "invoice"}

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB


class PresignUploadInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purpose: Literal["product-image", "variant-image", "payment-proof", "invoice"] = Field(
        ..., description="Approved upload purpose"
    )
    fileName: str = Field(..., min_length=1, max_length=200)
    contentType: str = Field(..., description="MIME content type")
    fileSizeBytes: StrictInt = Field(..., gt=0, le=MAX_FILE_SIZE_BYTES)
    orderId: Optional[str] = None
    productId: Optional[str] = None
    variantId: Optional[str] = None


class PrivateObjectInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purpose: Literal["payment-proof", "invoice"]
    orderId: str = Field(..., min_length=3, max_length=64)
    storageKey: str = Field(..., min_length=10, max_length=500)


class VerifyPrivateUploadInput(PrivateObjectInput):
    contentType: str
    fileSizeBytes: StrictInt = Field(..., gt=0, le=MAX_FILE_SIZE_BYTES)


def sanitize_path_part(value: Optional[str], default: str = "general") -> str:
    if not value or not value.strip():
        return default
    cleaned = value.strip().lower()
    # Strip any dots, slashes, and special characters to strictly prevent path traversal
    cleaned = re.sub(r"[^a-z0-9_-]+", "-", cleaned)
    cleaned = re.sub(r"^[-_]+|[-_]+$", "", cleaned)
    return cleaned[:64] or default


def get_file_extension(filename: str, content_type: str) -> str:
    if content_type in ALLOWED_CONTENT_TYPES:
        return ALLOWED_CONTENT_TYPES[content_type]
    parts = filename.rsplit(".", 1)
    if len(parts) == 2 and re.match(r"^[a-zA-Z0-9]{2,5}$", parts[1]):
        return parts[1].lower()
    return "bin"


def expected_private_key_prefix(order_id: str, purpose: str) -> str:
    return f"orders/{sanitize_path_part(order_id, 'general')}/{purpose}/"


def validate_private_storage_key(order_id: str, purpose: str, storage_key: str) -> None:
    expected_prefix = expected_private_key_prefix(order_id, purpose)
    if not storage_key.startswith(expected_prefix) or ".." in storage_key or "\\" in storage_key:
        raise HTTPException(status_code=400, detail="Storage key does not belong to this order.")


def create_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
    )


@router.post("/presign", response_model=Dict[str, Any])
async def create_presigned_upload_url(payload: PresignUploadInput):
    if payload.contentType not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng tệp không được hỗ trợ. Các định dạng cho phép: {', '.join(ALLOWED_CONTENT_TYPES.keys())}",
        )

    if payload.purpose in {"product-image", "variant-image"} and payload.contentType not in IMAGE_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Ảnh sản phẩm chỉ chấp nhận định dạng ảnh.")

    if payload.fileSizeBytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dung lượng tệp vượt quá giới hạn tối đa 10MB.",
        )

    if payload.purpose == "product-image" and not payload.productId:
        raise HTTPException(status_code=400, detail="Thiếu productId cho ảnh sản phẩm.")
    if payload.purpose == "variant-image" and (not payload.productId or not payload.variantId):
        raise HTTPException(status_code=400, detail="Thiếu productId hoặc variantId cho ảnh biến thể.")
    if payload.purpose in {"payment-proof", "invoice"} and not payload.orderId:
        raise HTTPException(status_code=400, detail="Thiếu orderId cho chứng từ đơn hàng.")

    target_bucket = settings.R2_PRIVATE_BUCKET if payload.purpose in PRIVATE_UPLOAD_PURPOSES else settings.R2_BUCKET
    if not all(
        (
            settings.R2_ACCOUNT_ID,
            settings.R2_ACCESS_KEY_ID,
            settings.R2_SECRET_ACCESS_KEY,
            target_bucket,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Upload storage is not configured.",
        )

    try:
        s3_client = create_r2_client()

        ext = get_file_extension(payload.fileName, payload.contentType)
        unique_token = uuid.uuid4().hex[:12]

        if payload.purpose == "product-image":
            prod = sanitize_path_part(payload.productId, "new")
            key = f"products/{prod}/{unique_token}.{ext}"
        elif payload.purpose == "variant-image":
            prod = sanitize_path_part(payload.productId, "new")
            var = sanitize_path_part(payload.variantId, "variant")
            key = f"variants/{prod}/{var}/{unique_token}.{ext}"
        elif payload.purpose in {"payment-proof", "invoice"}:
            order = sanitize_path_part(payload.orderId, "general")
            key = f"orders/{order}/{payload.purpose}/{unique_token}.{ext}"
        else:  # pragma: no cover - Literal validation and checks above make this unreachable.
            raise HTTPException(status_code=400, detail="Mục đích upload không hợp lệ.")

        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": target_bucket,
                "Key": key,
                "ContentType": payload.contentType,
                "ContentLength": payload.fileSizeBytes,
            },
            ExpiresIn=300,
        )

        public_url = None
        if payload.purpose not in PRIVATE_UPLOAD_PURPOSES:
            public_base = (settings.R2_PUBLIC_BASE_URL or "").rstrip("/")
            public_url = f"{public_base}/{key}" if public_base else f"https://{settings.R2_BUCKET}.r2.dev/{key}"

        return {
            "key": key,
            "uploadUrl": presigned_url,
            "expiresInSeconds": 300,
            "publicUrl": public_url,
        }
    except Exception:
        logger.exception("Failed to create an R2 presigned upload URL")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create upload URL.",
        )


@router.post("/verify-private-upload", response_model=Dict[str, Any])
async def verify_private_upload(payload: VerifyPrivateUploadInput):
    if payload.contentType not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported private object content type.")
    validate_private_storage_key(payload.orderId, payload.purpose, payload.storageKey)
    if not all(
        (
            settings.R2_ACCOUNT_ID,
            settings.R2_ACCESS_KEY_ID,
            settings.R2_SECRET_ACCESS_KEY,
            settings.R2_PRIVATE_BUCKET,
        )
    ):
        raise HTTPException(status_code=503, detail="Private upload storage is not configured.")

    try:
        metadata = create_r2_client().head_object(
            Bucket=settings.R2_PRIVATE_BUCKET,
            Key=payload.storageKey,
        )
    except Exception:
        logger.warning("Unable to verify private upload object", exc_info=True)
        raise HTTPException(status_code=400, detail="Uploaded object could not be verified.")

    actual_size = metadata.get("ContentLength")
    actual_type = str(metadata.get("ContentType") or "").split(";", 1)[0].strip().lower()
    if actual_size != payload.fileSizeBytes or actual_type != payload.contentType:
        raise HTTPException(status_code=400, detail="Uploaded object metadata does not match the submitted proof.")

    return {"verified": True}


@router.post("/private-download-url", response_model=Dict[str, Any])
async def create_private_download_url(payload: PrivateObjectInput):
    validate_private_storage_key(payload.orderId, payload.purpose, payload.storageKey)
    if not all(
        (
            settings.R2_ACCOUNT_ID,
            settings.R2_ACCESS_KEY_ID,
            settings.R2_SECRET_ACCESS_KEY,
            settings.R2_PRIVATE_BUCKET,
        )
    ):
        raise HTTPException(status_code=503, detail="Private upload storage is not configured.")

    try:
        download_url = create_r2_client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.R2_PRIVATE_BUCKET,
                "Key": payload.storageKey,
                "ResponseContentDisposition": "attachment",
            },
            ExpiresIn=60,
        )
    except Exception:
        logger.exception("Failed to create a private R2 download URL")
        raise HTTPException(status_code=500, detail="Unable to create download URL.")

    return {"downloadUrl": download_url, "expiresInSeconds": 60}
