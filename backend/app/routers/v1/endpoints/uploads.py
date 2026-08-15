import logging
import re
import uuid
from typing import Any, Dict, Optional

import boto3
from botocore.config import Config
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

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

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB


class PresignUploadInput(BaseModel):
    purpose: str = Field(..., description="Upload purpose: product-image, variant-image, payment-proof, invoice")
    fileName: str = Field(..., min_length=1, max_length=200)
    contentType: str = Field(..., description="MIME content type")
    fileSizeBytes: int = Field(..., gt=0, le=MAX_FILE_SIZE_BYTES)
    orderId: Optional[str] = None
    productId: Optional[str] = None
    variantId: Optional[str] = None


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


@router.post("/presign", response_model=Dict[str, Any])
async def create_presigned_upload_url(payload: PresignUploadInput):
    if payload.contentType not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng tệp không được hỗ trợ. Các định dạng cho phép: {', '.join(ALLOWED_CONTENT_TYPES.keys())}",
        )

    if payload.fileSizeBytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dung lượng tệp vượt quá giới hạn tối đa 10MB.",
        )

    if not all(
        (
            settings.R2_ACCOUNT_ID,
            settings.R2_ACCESS_KEY_ID,
            settings.R2_SECRET_ACCESS_KEY,
            settings.R2_BUCKET,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Upload storage is not configured.",
        )

    try:
        s3_client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
        )

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
        else:
            purp = sanitize_path_part(payload.purpose, "general")
            key = f"uploads/{purp}/{unique_token}.{ext}"

        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.R2_BUCKET,
                "Key": key,
                "ContentType": payload.contentType,
            },
            ExpiresIn=300,
        )

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
