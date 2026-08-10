from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any
from app.core.config import settings
import boto3
from botocore.config import Config
import time
import re

router = APIRouter()

class PresignUploadInput(BaseModel):
    orderId: str
    fileName: str
    contentType: str
    fileSizeBytes: int
    purpose: str # payment-proof, invoice, product-image

def sanitize_path_part(value: str) -> str:
    cleaned = value.lower()
    cleaned = re.sub(r'[^a-z0-9._-]+', '-', cleaned)
    cleaned = re.sub(r'^-+|-+$', '', cleaned)
    return cleaned[:80]

@router.post("/presign", response_model=Dict[str, Any])
async def create_presigned_upload_url(payload: PresignUploadInput):
    """
    Tạo presigned URL để tải tài liệu/hình ảnh lên Cloudflare R2 trực tiếp từ client.
    """
    if not settings.R2_ACCOUNT_ID or not settings.R2_ACCESS_KEY_ID or not settings.R2_SECRET_ACCESS_KEY:
         # Dev mode fallback
         mock_key = f"{payload.purpose}/{sanitize_path_part(payload.orderId)}/{int(time.time())}-{sanitize_path_part(payload.fileName)}"
         return {
             "key": mock_key,
             "uploadUrl": "https://httpbin.org/put",
             "expiresInSeconds": 300,
             "publicUrl": f"{settings.R2_PUBLIC_BASE_URL}/{mock_key}"
         }
         
    try:
        s3_client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4")
        )
        
        key = f"{payload.purpose}/{sanitize_path_part(payload.orderId)}/{int(time.time())}-{sanitize_path_part(payload.fileName)}"
        
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.R2_BUCKET,
                "Key": key,
                "ContentType": payload.contentType
            },
            ExpiresIn=300
        )
        
        public_url = f"{settings.R2_PUBLIC_BASE_URL}/{key}"
        return {
            "key": key,
            "uploadUrl": presigned_url,
            "expiresInSeconds": 300,
            "publicUrl": public_url
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể tạo presigned URL: {str(e)}"
        )
