from app.core.database_connection import build_database_connect_config


def test_remote_postgres_requires_encrypted_connection_by_default():
    url, connect_args = build_database_connect_config(
        "postgresql+asyncpg://user:pass@db.example.com:5432/app"
    )

    assert url.host == "db.example.com"
    assert url.password == "pass"
    assert not url.query
    assert connect_args == {"ssl": "require", "timeout": 10}


def test_sslmode_query_is_moved_to_asyncpg_ssl_argument():
    url, connect_args = build_database_connect_config(
        "postgresql+asyncpg://user:pass@db.example.com:5432/app"
        "?sslmode=require&prepared_statement_cache_size=0"
    )

    assert url.host == "db.example.com"
    assert dict(url.query) == {"prepared_statement_cache_size": "0"}
    assert connect_args == {"ssl": "require", "timeout": 10}


def test_pooler_client_only_query_flags_are_not_sent_to_asyncpg():
    url, connect_args = build_database_connect_config(
        "postgresql+asyncpg://user:pass@pooler.example.com:6543/app"
        "?sslmode=require&pgbouncer=true&connection_limit=1&supa=metadata"
    )

    assert not url.query
    assert connect_args == {"ssl": "require", "timeout": 10}


def test_local_postgres_does_not_force_ssl():
    url, connect_args = build_database_connect_config(
        "postgresql+asyncpg://user:pass@localhost:5432/app"
    )

    assert url.host == "localhost"
    assert connect_args == {"timeout": 10}
