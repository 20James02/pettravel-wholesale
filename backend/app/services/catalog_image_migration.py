from __future__ import annotations

import base64
import binascii
import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping
from urllib.parse import urlsplit

from botocore.exceptions import ClientError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


MAX_IMAGE_BYTES = 10 * 1024 * 1024
_DATA_URL_RE = re.compile(
    r"^data:(image/(?:jpeg|png|webp|avif));base64,([A-Za-z0-9+/=]+)$",
    re.IGNORECASE,
)
_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
}


@dataclass(frozen=True)
class DecodedLegacyImage:
    content_type: str
    extension: str
    payload: bytes = field(repr=False)
    sha256: str


@dataclass
class PlannedUpload:
    key: str
    public_url: str
    image: DecodedLegacyImage = field(repr=False)
    locations: list[str]


@dataclass
class CatalogImageMigrationPlan:
    uploads: dict[str, PlannedUpload]
    product_updates: list[dict[str, Any]]
    variant_updates: list[dict[str, Any]]
    legacy_reference_count: int

    def manifest(self, *, applied: bool) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "mode": "applied" if applied else "dry-run",
            "legacyReferenceCount": self.legacy_reference_count,
            "uniqueObjectCount": len(self.uploads),
            "productRowCount": len(self.product_updates),
            "variantRowCount": len(self.variant_updates),
            "objects": [
                {
                    "key": upload.key,
                    "contentType": upload.image.content_type,
                    "byteLength": len(upload.image.payload),
                    "sha256": upload.image.sha256,
                    "locations": sorted(upload.locations),
                }
                for upload in sorted(self.uploads.values(), key=lambda item: item.key)
            ],
        }


def _has_expected_magic(payload: bytes, content_type: str) -> bool:
    if content_type == "image/jpeg":
        return payload.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return payload.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        return len(payload) >= 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP"
    if content_type == "image/avif":
        return len(payload) >= 16 and payload[4:8] == b"ftyp" and any(
            brand in payload[8:32] for brand in (b"avif", b"avis")
        )
    return False


def decode_legacy_image_data_url(value: str) -> DecodedLegacyImage:
    match = _DATA_URL_RE.fullmatch(value.strip())
    if not match:
        raise ValueError("Legacy image is not a supported base64 image data URL.")

    content_type = match.group(1).lower()
    encoded_payload = match.group(2)
    if len(encoded_payload) > ((MAX_IMAGE_BYTES + 2) // 3) * 4:
        raise ValueError("Legacy image exceeds the 10 MB migration limit.")
    try:
        payload = base64.b64decode(encoded_payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Legacy image contains invalid base64 data.") from exc
    if not payload or len(payload) > MAX_IMAGE_BYTES:
        raise ValueError("Legacy image is empty or exceeds the 10 MB migration limit.")
    if not _has_expected_magic(payload, content_type):
        raise ValueError("Legacy image MIME type does not match its binary signature.")

    return DecodedLegacyImage(
        content_type=content_type,
        extension=_EXTENSIONS[content_type],
        payload=payload,
        sha256=hashlib.sha256(payload).hexdigest(),
    )


def _safe_path_part(value: Any, fallback: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_-]+", "-", str(value or "").strip().lower())
    cleaned = re.sub(r"^[-_]+|[-_]+$", "", cleaned)
    return cleaned[:64] or fallback


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item) for item in value]
    raise ValueError("Catalog gallery must be a PostgreSQL text array.")


def _public_base_url(value: str) -> str:
    clean_value = value.strip().rstrip("/")
    parsed = urlsplit(clean_value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("R2 public base URL must be a credential-free HTTPS URL.")
    return clean_value


def build_catalog_image_migration_plan(
    product_rows: Iterable[Mapping[str, Any]],
    variant_rows: Iterable[Mapping[str, Any]],
    public_base_url: str,
) -> CatalogImageMigrationPlan:
    public_base = _public_base_url(public_base_url)
    uploads: dict[str, PlannedUpload] = {}
    product_updates: list[dict[str, Any]] = []
    variant_updates: list[dict[str, Any]] = []
    legacy_reference_count = 0

    def migrate_value(value: Any, *, key_prefix: str, location: str) -> str:
        nonlocal legacy_reference_count
        clean_value = str(value or "").strip()
        if not clean_value.lower().startswith("data:"):
            return clean_value
        try:
            image = decode_legacy_image_data_url(clean_value)
        except ValueError as exc:
            raise ValueError(f"Cannot migrate {location}: {exc}") from exc
        key = f"{key_prefix}/legacy-{image.sha256[:24]}.{image.extension}"
        public_url = f"{public_base}/{key}"
        existing = uploads.get(key)
        if existing:
            if existing.image.sha256 != image.sha256:
                raise ValueError(f"Deterministic object key collision at {location}.")
            existing.locations.append(location)
        else:
            uploads[key] = PlannedUpload(
                key=key,
                public_url=public_url,
                image=image,
                locations=[location],
            )
        legacy_reference_count += 1
        return public_url

    for row in product_rows:
        product_id = str(row["id"])
        safe_product_id = _safe_path_part(product_id, "product")
        old_image_url = row.get("image_url")
        old_images = _string_list(row.get("images"))
        new_image_url = migrate_value(
            old_image_url,
            key_prefix=f"products/{safe_product_id}",
            location=f"product:{product_id}:image_url",
        )
        new_images = [
            migrate_value(
                image,
                key_prefix=f"products/{safe_product_id}",
                location=f"product:{product_id}:images:{index}",
            )
            for index, image in enumerate(old_images)
        ]
        if new_image_url != str(old_image_url or "").strip() or new_images != old_images:
            product_updates.append(
                {
                    "id": product_id,
                    "old_image_url": old_image_url,
                    "old_images": old_images,
                    "new_image_url": new_image_url,
                    "new_images": new_images,
                }
            )

    for row in variant_rows:
        variant_id = str(row["id"])
        product_id = str(row["product_id"])
        old_image_url = row.get("image_url")
        new_image_url = migrate_value(
            old_image_url,
            key_prefix=(
                f"variants/{_safe_path_part(product_id, 'product')}/"
                f"{_safe_path_part(variant_id, 'variant')}"
            ),
            location=f"variant:{variant_id}:image_url",
        )
        if new_image_url != str(old_image_url or "").strip():
            variant_updates.append(
                {
                    "id": variant_id,
                    "old_image_url": old_image_url,
                    "new_image_url": new_image_url,
                }
            )

    return CatalogImageMigrationPlan(
        uploads=uploads,
        product_updates=product_updates,
        variant_updates=variant_updates,
        legacy_reference_count=legacy_reference_count,
    )


def _verify_object_metadata(metadata: Mapping[str, Any], upload: PlannedUpload) -> None:
    actual_type = str(metadata.get("ContentType") or "").split(";", 1)[0].strip().lower()
    actual_sha256 = str((metadata.get("Metadata") or {}).get("sha256") or "").lower()
    if (
        metadata.get("ContentLength") != len(upload.image.payload)
        or actual_type != upload.image.content_type
        or actual_sha256 != upload.image.sha256
    ):
        raise RuntimeError(f"R2 object metadata mismatch for key {upload.key}.")


def ensure_r2_object(client: Any, bucket: str, upload: PlannedUpload) -> None:
    try:
        metadata = client.head_object(Bucket=bucket, Key=upload.key)
    except ClientError as exc:
        error_code = str(exc.response.get("Error", {}).get("Code", ""))
        if error_code not in {"404", "NoSuchKey", "NotFound"}:
            raise
    else:
        _verify_object_metadata(metadata, upload)
        return

    client.put_object(
        Bucket=bucket,
        Key=upload.key,
        Body=upload.image.payload,
        ContentType=upload.image.content_type,
        CacheControl="public, max-age=31536000, immutable",
        Metadata={"sha256": upload.image.sha256},
    )
    _verify_object_metadata(client.head_object(Bucket=bucket, Key=upload.key), upload)




async def apply_catalog_image_database_updates(
    session: AsyncSession,
    plan: CatalogImageMigrationPlan,
) -> None:
    """Atomically apply a plan only while every scanned source value is unchanged."""
    async with session.begin():
        for update in plan.product_updates:
            result = await session.execute(
                text("""update products
                    set image_url = :new_image_url, images = :new_images
                    where id = :id
                      and image_url is not distinct from :old_image_url
                      and images is not distinct from :old_images"""),
                update,
            )
            if result.rowcount != 1:
                raise RuntimeError(f"Product {update['id']} changed after dry-run; transaction aborted.")
        for update in plan.variant_updates:
            result = await session.execute(
                text("""update product_variants
                    set image_url = :new_image_url
                    where id = :id and image_url is not distinct from :old_image_url"""),
                update,
            )
            if result.rowcount != 1:
                raise RuntimeError(f"Variant {update['id']} changed after dry-run; transaction aborted.")
