import ssl
from pathlib import Path

from sqlalchemy.engine import URL, make_url


LOCAL_DATABASE_HOSTS = {None, "localhost", "127.0.0.1", "::1"}
REMOTE_SSL_MODES = {"require", "verify-ca", "verify-full"}
NON_ASYNCPG_QUERY_KEYS = {
    "connection_limit",
    "pgbouncer",
    "ssl",
    "sslmode",
    "sslrootcert",
    "supa",
}


def build_database_connect_config(
    database_url: str,
    *,
    ssl_mode: str | None = None,
    ssl_root_cert: str | None = None,
) -> tuple[URL, dict[str, object]]:
    """Build SQLAlchemy URL/connect args without exposing credentials."""
    url = make_url(database_url)
    if url.drivername.startswith("sqlite"):
        return url, {}

    query_ssl_mode = url.query.get("sslmode") or url.query.get("ssl")
    query_root_cert = url.query.get("sslrootcert")
    clean_url = url.difference_update_query(NON_ASYNCPG_QUERY_KEYS)

    if url.host in LOCAL_DATABASE_HOSTS:
        return clean_url, {"timeout": 10}

    selected_mode = (ssl_mode or query_ssl_mode or "require").strip().lower()
    if selected_mode not in REMOTE_SSL_MODES:
        allowed = ", ".join(sorted(REMOTE_SSL_MODES))
        raise ValueError(f"Remote DB_SSL_MODE must be one of: {allowed}.")

    connect_args: dict[str, object] = {"timeout": 10}
    if selected_mode == "require":
        connect_args["ssl"] = "require"
        return clean_url, connect_args

    root_cert = (ssl_root_cert or query_root_cert or "").strip()
    if not root_cert:
        raise ValueError(
            f"DB_SSL_ROOT_CERT is required when DB_SSL_MODE={selected_mode}."
        )

    cert_path = Path(root_cert).expanduser()
    if not cert_path.is_file():
        raise FileNotFoundError(f"Database SSL root certificate not found: {cert_path}")

    ssl_context = ssl.create_default_context(
        ssl.Purpose.SERVER_AUTH,
        cafile=str(cert_path),
    )
    ssl_context.check_hostname = selected_mode == "verify-full"
    connect_args["ssl"] = ssl_context
    return clean_url, connect_args
