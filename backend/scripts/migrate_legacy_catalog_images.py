from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def preload_requested_env_file() -> None:
    pre_parser = argparse.ArgumentParser(add_help=False)
    pre_parser.add_argument("--env-file", type=Path)
    pre_args, _ = pre_parser.parse_known_args()
    if not pre_args.env_file:
        return
    env_path = pre_args.env_file.resolve()
    if not env_path.is_file():
        raise RuntimeError(f"Environment file does not exist: {env_path}")
    for key, value in dotenv_values(env_path).items():
        if key and value is not None:
            os.environ[key] = value


preload_requested_env_file()

from app.core.config import settings
from app.core.db import async_session_maker, engine
from app.routers.v1.endpoints.uploads import create_r2_client
from app.services.catalog_image_migration import (
    CatalogImageMigrationPlan,
    apply_catalog_image_database_updates,
    build_catalog_image_migration_plan,
    ensure_r2_object,
)


REPO_ROOT = BACKEND_ROOT.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Migrate legacy catalog data:image URLs to public R2 objects. Dry-run is the default."
    )
    parser.add_argument("--apply", action="store_true", help="Upload verified objects and update PostgreSQL.")
    parser.add_argument("--env-file", type=Path, help="Optional ignored env file to load before app configuration.")
    parser.add_argument(
        "--public-base-url",
        help="Override the public R2 HTTPS base URL; required for apply when the env value is redacted.",
    )
    parser.add_argument(
        "--expected-legacy-references",
        type=int,
        help="Required with --apply; must equal the dry-run legacy reference count.",
    )
    parser.add_argument("--manifest", type=Path, help="Safe JSON manifest path; defaults to scratch/.")
    return parser.parse_args()


async def load_catalog_rows() -> tuple[list[dict], list[dict]]:
    async with async_session_maker() as session:
        products = (
            await session.execute(text("select id, image_url, images from products order by id"))
        ).mappings().all()
        variants = (
            await session.execute(
                text("select id, product_id, image_url from product_variants order by product_id, id")
            )
        ).mappings().all()
        return [dict(row) for row in products], [dict(row) for row in variants]


async def apply_database_updates(plan: CatalogImageMigrationPlan) -> None:
    async with async_session_maker() as session:
        await apply_catalog_image_database_updates(session, plan)


def write_manifest(plan: CatalogImageMigrationPlan, path: Path, *, applied: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(plan.manifest(applied=applied), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


async def main() -> None:
    args = parse_args()
    if engine.dialect.name != "postgresql":
        raise RuntimeError("Catalog image migration only supports PostgreSQL.")

    product_rows, variant_rows = await load_catalog_rows()
    configured_public_base = (args.public_base_url or settings.R2_PUBLIC_BASE_URL).strip()
    try:
        plan = build_catalog_image_migration_plan(product_rows, variant_rows, configured_public_base)
    except ValueError:
        if args.apply:
            raise
        configured_public_base = "https://catalog-migration-dry-run.invalid"
        plan = build_catalog_image_migration_plan(product_rows, variant_rows, configured_public_base)
        print("R2 public base URL is unavailable/redacted; dry-run uses a non-routable preview base.")
    default_manifest = REPO_ROOT / "scratch" / (
        f"catalog-image-migration-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    )
    manifest_path = (args.manifest or default_manifest).resolve()

    print(
        "Catalog image migration plan: "
        f"references={plan.legacy_reference_count}, unique_objects={len(plan.uploads)}, "
        f"product_rows={len(plan.product_updates)}, variant_rows={len(plan.variant_updates)}"
    )
    if not args.apply:
        write_manifest(plan, manifest_path, applied=False)
        print(f"Dry-run only. Safe manifest written to {manifest_path}")
        return

    if args.expected_legacy_references is None:
        raise RuntimeError("--expected-legacy-references is required with --apply.")
    if args.expected_legacy_references != plan.legacy_reference_count:
        raise RuntimeError("Legacy reference count changed after dry-run; apply aborted.")
    if "example" in configured_public_base.lower() or ".invalid" in configured_public_base.lower():
        raise RuntimeError("Apply requires the real public R2 HTTPS base URL, not a placeholder.")
    if not settings.R2_BUCKET.strip():
        raise RuntimeError("Public R2 bucket is not configured.")
    if not all((settings.R2_ACCOUNT_ID, settings.R2_ACCESS_KEY_ID, settings.R2_SECRET_ACCESS_KEY)):
        raise RuntimeError("R2 write credentials are incomplete.")

    client = create_r2_client()
    for upload in sorted(plan.uploads.values(), key=lambda item: item.key):
        ensure_r2_object(client, settings.R2_BUCKET, upload)
    await apply_database_updates(plan)
    write_manifest(plan, manifest_path, applied=True)
    print(f"Migration applied and verified. Safe manifest written to {manifest_path}")


async def run() -> None:
    try:
        await main()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
