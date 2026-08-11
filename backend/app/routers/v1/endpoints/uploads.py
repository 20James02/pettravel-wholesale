import logging
import re
import time
from typing import Any, Dict

import boto3
from botocore.config import Config
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings


router = APIRouter()
logger = logging.getLogger(__name__)


class PresignUploadInput(BaseModel):
    orderId: str
    fileName: str
    contentType: str
    fileSizeBytes: int
    purpose: str


def sanitize_path_part(value: str) -> str:
    cleaned = value.lower()
    cleaned = re.sub(r"[^a-z0-9._-]+", "-", cleaned)
    cleaned = re.sub(r"^-+|-+$", "", cleaned)
    return cleaned[:80]


@router.post("/presign", response_model=Dict[str, Any])
async def create_presigned_upload_url(payload: PresignUploadInput):
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

        key = (
            f"{sanitize_path_part(payload.purpose)}/"
            f"{sanitize_path_part(payload.orderId)}/"
            f"{int(time.time())}-{sanitize_path_part(payload.fileName)}"
        )
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.R2_BUCKET,
                "Key": key,
                "ContentType": payload.contentType,
            },
            ExpiresIn=300,
        )

        return {
            "key": key,
            "uploadUrl": presigned_url,
            "expiresInSeconds": 300,
            "publicUrl": f"{settings.R2_PUBLIC_BASE_URL.rstrip('/')}/{key}",
        }
    except Exception:
        logger.exception("Failed to create an R2 presigned upload URL")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create upload URL.",
        )
