import json
import sys
from pathlib import Path
from urllib.parse import urlparse

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database_connection import build_database_connect_config
from app.core.config import Settings


def main() -> None:
    production_settings = Settings(ENVIRONMENT="production")
    database_url = production_settings.async_database_url
    parsed = urlparse(
        database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    )
    print(
        "DB_TARGET_SAFE_SUMMARY="
        + json.dumps(
            {
                "database": parsed.path.lstrip("/") or None,
                "host": parsed.hostname,
                "port": parsed.port,
                "scheme": "postgresql+asyncpg",
            },
            sort_keys=True,
        )
    )
    production_settings.validate_production_configuration()
    _, connect_args = build_database_connect_config(
        database_url,
        ssl_mode=production_settings.DB_SSL_MODE or None,
        ssl_root_cert=production_settings.DB_SSL_ROOT_CERT or None,
    )
    print(
        "DB_TLS_SAFE_SUMMARY="
        + json.dumps(
            {
                "ssl": "configured" if "ssl" in connect_args else "not_configured",
                "timeout": connect_args.get("timeout"),
            },
            sort_keys=True,
        )
    )
    print("PRODUCTION_ENV_PREFLIGHT_OK=true")


if __name__ == "__main__":
    main()
