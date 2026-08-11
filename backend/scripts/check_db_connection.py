import argparse
import asyncio
import json
import os
import socket
import ssl
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy.engine import make_url
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


HEALTHCHECK_KEY = "__healthcheck_db__"
DATABASE_ENV_KEYS = ("POSTGRES_URL", "DATABASE_URL", "SUPABASE_DB_URL")
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def load_env_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Env file not found: {path}")

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def safe_database_summary(url: str) -> dict[str, object]:
    parsed = urlparse(url)
    database = parsed.path.lstrip("/") if parsed.path and (parsed.scheme.startswith("sqlite") or parsed.hostname) else ""

    return {
        "scheme": parsed.scheme or None,
        "host": parsed.hostname,
        "port": parsed.port,
        "database": database or None,
        "has_query": bool(parsed.query),
        "is_local": parsed.hostname in {"localhost", "127.0.0.1", "::1"},
    }


def safe_sqlalchemy_url_summary(url: str) -> dict[str, object]:
    try:
        parsed = make_url(url)
    except Exception as exc:
        return {
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
        }

    return {
        "ok": True,
        "drivername": parsed.drivername,
        "host": parsed.host,
        "port": parsed.port,
        "database": parsed.database,
        "username_length": len(parsed.username or ""),
        "has_password": bool(parsed.password),
        "query_keys": sorted(parsed.query.keys()),
    }


def resolve_dns_summary(url: str) -> dict[str, object]:
    parsed = urlparse(url)
    if parsed.scheme.startswith("sqlite") or not parsed.hostname:
        return {
            "checked": False,
            "reason": "no_remote_hostname",
        }

    try:
        results = socket.getaddrinfo(parsed.hostname, parsed.port or 5432, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        return {
            "checked": True,
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
        }

    families = sorted(
        {
            "IPv6" if family == socket.AF_INET6 else "IPv4" if family == socket.AF_INET else str(family)
            for family, *_ in results
        }
    )
    return {
        "checked": True,
        "ok": bool(results),
        "address_families": families,
        "result_count": len(results),
    }


def normalize_async_database_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def database_url_source(settings: object) -> tuple[str, str]:
    for key in DATABASE_ENV_KEYS:
        value = os.getenv(key)
        if value:
            return key, value

    return "Settings.DATABASE_URL", getattr(settings, "DATABASE_URL", "")


def safe_source_summary(source_key: str, raw_value: str) -> dict[str, object]:
    stripped_value = raw_value.strip()
    return {
        "source": source_key,
        "length": len(raw_value),
        "has_scheme_marker": "://" in raw_value,
        "has_host_separator": "@" in raw_value,
        "is_blank": not bool(raw_value),
        "starts_with_supported_scheme": stripped_value.startswith(
            ("postgresql://", "postgres://", "postgresql+asyncpg://", "sqlite+aiosqlite://")
        ),
        "scheme_marker_index": raw_value.find("://"),
        "starts_with_psql_command": stripped_value.lower().startswith("psql "),
        "contains_env_assignment": any(f"{key}=" in stripped_value for key in DATABASE_ENV_KEYS),
    }


async def run_probe(write_health: bool) -> None:
    from app.core.config import Settings
    from app.core.database_connection import build_database_connect_config

    settings = Settings()
    source_key, raw_database_url = database_url_source(settings)
    database_url = normalize_async_database_url(settings.async_database_url)
    print("DB_ENV_SOURCE_SAFE=" + json.dumps(safe_source_summary(source_key, raw_database_url), sort_keys=True))
    print("DB_TARGET_SAFE_SUMMARY=" + json.dumps(safe_database_summary(database_url), sort_keys=True))
    print("DB_SQLALCHEMY_URL_SAFE=" + json.dumps(safe_sqlalchemy_url_summary(database_url), sort_keys=True))
    dns_summary = resolve_dns_summary(database_url)
    print("DB_DNS_SAFE=" + json.dumps(dns_summary, sort_keys=True))

    if dns_summary.get("checked") and not dns_summary.get("ok"):
        raise RuntimeError(
            "DNS lookup failed for the database host. Verify the project ref/host, local DNS, VPN/firewall, "
            "or use the Supabase Supavisor pooler connection string if this environment cannot reach the direct host."
        )

    if not database_url.startswith(("postgresql+asyncpg://", "sqlite+aiosqlite://")):
        raise RuntimeError(
            f"{source_key} must be a PostgreSQL or SQLite async connection URL "
            "(for example postgresql://user:password@host:5432/database)."
        )

    engine_url, connect_args = build_database_connect_config(
        database_url,
        ssl_mode=settings.DB_SSL_MODE or None,
        ssl_root_cert=settings.DB_SSL_ROOT_CERT or None,
    )
    engine = create_async_engine(
        engine_url,
        echo=False,
        future=True,
        pool_pre_ping=True,
        connect_args=connect_args,
    )

    try:
        async with engine.begin() as conn:
            result = await conn.execute(text("select 1"))
            if result.scalar_one() != 1:
                raise RuntimeError("Database did not return the expected SELECT 1 result.")

            print("DB_SELECT_OK=true")

            if write_health:
                checked_at = datetime.now(timezone.utc).isoformat()
                payload = json.dumps(
                    {
                        "checkedAt": checked_at,
                        "purpose": "database_read_write_healthcheck",
                    },
                    separators=(",", ":"),
                )

                await conn.execute(
                    text(
                        """
                        insert into app_settings(key, value)
                        values (:key, cast(:value as jsonb))
                        on conflict (key) do update set value = excluded.value
                        """
                    ),
                    {"key": HEALTHCHECK_KEY, "value": payload},
                )

                verify = await conn.execute(
                    text("select value->>'checkedAt' from app_settings where key = :key"),
                    {"key": HEALTHCHECK_KEY},
                )
                if verify.scalar_one_or_none() != checked_at:
                    raise RuntimeError("Database health row was not written/read back correctly.")

                print("DB_WRITE_HEALTH_OK=true")
    finally:
        await engine.dispose()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check backend database connectivity without printing secrets.")
    parser.add_argument(
        "--env-file",
        action="append",
        default=[],
        help="Optional env file to load before checking, for example .env.backend.",
    )
    parser.add_argument(
        "--write-health",
        action="store_true",
        help="Also upsert/read the app_settings health row. Requires the app_settings table.",
    )
    parser.add_argument(
        "--show-trace",
        action="store_true",
        help="Show the full Python traceback for debugging script defects.",
    )
    parser.add_argument(
        "--dns-only",
        action="store_true",
        help="Resolve the configured database hostname and exit before opening a database connection.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        for env_file in args.env_file:
            load_env_file(Path(env_file))

        if args.dns_only:
            from app.core.config import Settings

            settings = Settings()
            source_key, raw_database_url = database_url_source(settings)
            database_url = normalize_async_database_url(settings.async_database_url)
            print("DB_ENV_SOURCE_SAFE=" + json.dumps(safe_source_summary(source_key, raw_database_url), sort_keys=True))
            print("DB_TARGET_SAFE_SUMMARY=" + json.dumps(safe_database_summary(database_url), sort_keys=True))
            print("DB_SQLALCHEMY_URL_SAFE=" + json.dumps(safe_sqlalchemy_url_summary(database_url), sort_keys=True))
            print("DB_DNS_SAFE=" + json.dumps(resolve_dns_summary(database_url), sort_keys=True))
            return

        asyncio.run(run_probe(write_health=args.write_health))
    except Exception as exc:
        print(f"DB_CHECK_ERROR={type(exc).__name__}: {exc}", file=sys.stderr)
        if isinstance(exc, ssl.SSLCertVerificationError):
            hint = (
                "The connection reached PostgreSQL but TLS certificate verification failed. Use the default "
                "DB_SSL_MODE=require for encrypted transport, or download the Supabase CA certificate and set "
                "DB_SSL_MODE=verify-full plus DB_SSL_ROOT_CERT to its local path."
            )
        elif isinstance(exc, socket.gaierror):
            hint = (
                "DNS resolution failed. Compare DB_SQLALCHEMY_URL_SAFE.host with DB_TARGET_SAFE_SUMMARY.host, "
                "URL-encode password special characters, and prefer the Supabase IPv4 pooler on IPv4-only networks."
            )
        else:
            hint = (
                "DNS and URL parsing passed; verify the Supabase pooler username, password, project, port, and "
                "network restrictions. Use --show-trace only when diagnosing a script defect."
            )
        print("DB_CHECK_HINT=" + hint, file=sys.stderr)
        if args.show_trace:
            raise
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
