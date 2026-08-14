import pytest

from app.core.config import Settings


def test_async_database_url_normalizes_postgres_scheme(monkeypatch):
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("VERCEL_ENV", raising=False)
    monkeypatch.delenv("NODE_ENV", raising=False)

    settings = Settings(DATABASE_URL="postgres://user:pass@db.example.com:5432/app")

    assert settings.async_database_url == "postgresql+asyncpg://user:pass@db.example.com:5432/app"


def test_async_database_url_requires_real_database_in_production(monkeypatch):
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    monkeypatch.setenv("VERCEL_ENV", "production")

    settings = Settings(DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/pettravel")

    with pytest.raises(RuntimeError, match="production PostgreSQL database URL"):
        _ = settings.async_database_url


def test_async_database_url_prefers_vercel_pooler_in_production(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    settings = Settings(
        DATABASE_URL="postgresql://user:pass@db.project.supabase.co:5432/postgres",
        POSTGRES_URL=(
            "postgres://postgres.project:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
        ),
    )

    assert settings.async_database_url == (
        "postgresql+asyncpg://postgres.project:pass@"
        "aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    )
