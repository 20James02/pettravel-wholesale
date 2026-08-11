import json
import os
import sys
from urllib.parse import urlparse


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
REMOTE_SSL_MODES = {"require", "verify-ca", "verify-full"}


def value(key: str) -> str:
    return (os.getenv(key) or "").strip().strip("\"'")


def bool_value(key: str) -> bool:
    return value(key).lower() in {"1", "true", "yes", "on"}


def require_value(errors: list[str], key: str, min_length: int = 1) -> str:
    configured = value(key)
    if len(configured) < min_length:
        errors.append(f"{key} is missing or too short")
    print(f"ENV_CHECK key={key} configured={len(configured) >= min_length}")
    return configured


def require_https_url(errors: list[str], key: str) -> str:
    configured = require_value(errors, key)
    if not configured:
        return configured

    parsed = urlparse(configured)
    ok = parsed.scheme == "https" and bool(parsed.hostname) and parsed.hostname not in LOCAL_HOSTS
    print(
        "ENV_URL_CHECK "
        f"key={key} https={parsed.scheme == 'https'} "
        f"host_configured={bool(parsed.hostname)} "
        f"public_host={parsed.hostname not in LOCAL_HOSTS if parsed.hostname else False}"
    )
    if not ok:
        errors.append(f"{key} must be a public HTTPS URL")
    return configured


def validate_database_url(errors: list[str]) -> None:
    database_url = require_value(errors, "DATABASE_URL")
    if not database_url:
        return

    normalized_url = database_url
    if normalized_url.startswith("postgres://"):
        normalized_url = normalized_url.replace("postgres://", "postgresql://", 1)
    elif normalized_url.startswith("postgresql+asyncpg://"):
        normalized_url = normalized_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    parsed = urlparse(normalized_url)
    safe_summary = {
        "database": parsed.path.lstrip("/") or None,
        "host": parsed.hostname,
        "port": parsed.port,
        "scheme": "postgresql+asyncpg" if parsed.scheme == "postgresql" else parsed.scheme,
    }
    print("DB_TARGET_SAFE_SUMMARY=" + json.dumps(safe_summary, sort_keys=True))

    if parsed.scheme != "postgresql" or not parsed.hostname:
        errors.append("DATABASE_URL must be a valid PostgreSQL URL")
    if parsed.hostname in LOCAL_HOSTS:
        errors.append("DATABASE_URL must not target localhost")

    ssl_mode = (value("DB_SSL_MODE") or "require").lower()
    if ssl_mode not in REMOTE_SSL_MODES:
        errors.append("DB_SSL_MODE must be one of: require, verify-ca, verify-full")
    if ssl_mode in {"verify-ca", "verify-full"} and not value("DB_SSL_ROOT_CERT"):
        errors.append(f"DB_SSL_ROOT_CERT is required when DB_SSL_MODE={ssl_mode}")

    print(
        "DB_TLS_SAFE_SUMMARY="
        + json.dumps(
            {
                "ssl": "configured" if ssl_mode in REMOTE_SSL_MODES else "invalid",
                "mode": ssl_mode,
            },
            sort_keys=True,
        )
    )


def main() -> int:
    errors: list[str] = []

    require_value(errors, "ENVIRONMENT")
    require_https_url(errors, "FRONTEND_URL")
    validate_database_url(errors)
    require_value(errors, "JWT_SECRET", 32)
    require_value(errors, "BACKEND_INTERNAL_SECRET", 32)

    for key in ("ALLOW_DEMO_DATA", "ALLOW_RUNTIME_MIGRATIONS"):
        disabled = not bool_value(key)
        print(f"ENV_FLAG_CHECK key={key} disabled={disabled}")
        if not disabled:
            errors.append(f"{key} must be false")

    r2_values = {
        "R2_ACCOUNT_ID": require_value(errors, "R2_ACCOUNT_ID"),
        "R2_ACCESS_KEY_ID": require_value(errors, "R2_ACCESS_KEY_ID"),
        "R2_SECRET_ACCESS_KEY": require_value(errors, "R2_SECRET_ACCESS_KEY"),
        "R2_BUCKET": require_value(errors, "R2_BUCKET"),
        "R2_PUBLIC_BASE_URL": require_value(errors, "R2_PUBLIC_BASE_URL"),
    }
    for key, configured in r2_values.items():
        if "example" in configured.lower():
            errors.append(f"{key} must not be a placeholder")

    if errors:
        for error in errors:
            print(f"ENV_PREFLIGHT_ERROR={error}", file=sys.stderr)
        return 1

    print("PRODUCTION_ENV_PREFLIGHT_OK=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
