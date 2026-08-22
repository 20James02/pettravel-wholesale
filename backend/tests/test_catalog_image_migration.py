import base64

import pytest
from botocore.exceptions import ClientError

from app.services.catalog_image_migration import (
    build_catalog_image_migration_plan,
    decode_legacy_image_data_url,
    ensure_r2_object,
)


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"migration-test"
PNG_DATA_URL = "data:image/png;base64," + base64.b64encode(PNG_BYTES).decode("ascii")


class FakeR2Client:
    def __init__(self):
        self.objects = {}
        self.put_count = 0

    def head_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "404", "Message": "missing"}}, "HeadObject")
        return self.objects[Key]

    def put_object(self, *, Bucket, Key, Body, ContentType, CacheControl, Metadata):
        self.put_count += 1
        self.objects[Key] = {
            "ContentLength": len(Body),
            "ContentType": ContentType,
            "Metadata": Metadata,
        }


def test_decode_legacy_image_checks_declared_mime_signature():
    decoded = decode_legacy_image_data_url(PNG_DATA_URL)
    assert decoded.payload == PNG_BYTES
    assert decoded.extension == "png"

    mismatched = "data:image/jpeg;base64," + base64.b64encode(PNG_BYTES).decode("ascii")
    with pytest.raises(ValueError, match="MIME type"):
        decode_legacy_image_data_url(mismatched)


def test_plan_replaces_all_legacy_locations_and_deduplicates_objects():
    plan = build_catalog_image_migration_plan(
        [
            {
                "id": "PROD 1",
                "image_url": PNG_DATA_URL,
                "images": [PNG_DATA_URL, "https://cdn.example.com/existing.webp"],
            }
        ],
        [{"id": "VAR 1", "product_id": "PROD 1", "image_url": PNG_DATA_URL}],
        "https://catalog.example.com/",
    )

    assert plan.legacy_reference_count == 3
    assert len(plan.uploads) == 2
    assert len(plan.product_updates) == 1
    assert len(plan.variant_updates) == 1
    manifest_text = str(plan.manifest(applied=False))
    assert "data:image" not in manifest_text
    assert "migration-test" not in manifest_text


def test_r2_upload_is_verified_and_idempotent():
    plan = build_catalog_image_migration_plan(
        [{"id": "prod_1", "image_url": PNG_DATA_URL, "images": []}],
        [],
        "https://catalog.example.com",
    )
    upload = next(iter(plan.uploads.values()))
    client = FakeR2Client()

    ensure_r2_object(client, "public", upload)
    ensure_r2_object(client, "public", upload)

    assert client.put_count == 1


def test_existing_r2_object_with_wrong_metadata_fails_closed():
    plan = build_catalog_image_migration_plan(
        [{"id": "prod_1", "image_url": PNG_DATA_URL, "images": []}],
        [],
        "https://catalog.example.com",
    )
    upload = next(iter(plan.uploads.values()))
    client = FakeR2Client()
    client.objects[upload.key] = {
        "ContentLength": len(PNG_BYTES),
        "ContentType": "image/png",
        "Metadata": {"sha256": "wrong"},
    }

    with pytest.raises(RuntimeError, match="metadata mismatch"):
        ensure_r2_object(client, "public", upload)
