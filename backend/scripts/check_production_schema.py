import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def load_env_file(path: Path) -> None:
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


async def check_schema() -> int:
    from app.core.config import Settings
    from app.core.database_connection import build_database_connect_config

    settings = Settings()
    engine_url, connect_args = build_database_connect_config(
        settings.async_database_url,
        ssl_mode=settings.DB_SSL_MODE or None,
        ssl_root_cert=settings.DB_SSL_ROOT_CERT or None,
    )
    engine = create_async_engine(engine_url, connect_args=connect_args, pool_pre_ping=True)
    checks: list[dict[str, object]] = []
    try:
        async with engine.connect() as conn:
            v7_sql = (REPO_ROOT / "supabase" / "check_v7_accounting_order_posting.sql").read_text(
                encoding="utf-8"
            )
            for row in (await conn.execute(text(v7_sql))).mappings().all():
                checks.append(
                    {"check": str(row["check_name"]), "ok": bool(row["ok"]), "detail": str(row["detail"])}
                )

            hardening_rows = (
                await conn.execute(
                    text("""select 'legacy exec_sql removed' as check_name,
                                  to_regprocedure('public.exec_sql(text)') is null as ok
                           union all
                           select 'v9 approval trigger installed',
                                  exists (select 1 from pg_trigger where tgname = 'trg_guard_quote_publication' and not tgisinternal)
                           union all
                           select 'v9 workflow constraint installed',
                                  exists (select 1 from pg_constraint where conname = 'customer_orders_commercial_status_check')
                           union all
                           select 'stock reservation function installed',
                                  to_regprocedure('public.pt_reserve_order_stock(text,text,timestamp with time zone)') is not null
                           union all
                           select 'variant image column installed',
                                  exists (select 1 from information_schema.columns
                                          where table_schema = 'public' and table_name = 'product_variants'
                                            and column_name = 'image_url')""")
                )
            ).mappings().all()
            checks.extend(
                {"check": str(row["check_name"]), "ok": bool(row["ok"]), "detail": ""}
                for row in hardening_rows
            )
    finally:
        await engine.dispose()

    print("PRODUCTION_SCHEMA_CHECKS=" + json.dumps(checks, ensure_ascii=False, sort_keys=True))
    ok = all(bool(check["ok"]) for check in checks)
    print(f"PRODUCTION_SCHEMA_OK={str(ok).lower()}")
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True)
    args = parser.parse_args()
    load_env_file(Path(args.env_file))
    return asyncio.run(check_schema())


if __name__ == "__main__":
    raise SystemExit(main())
