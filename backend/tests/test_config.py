import pytest

from app.core.config import Settings


def production_settings(**overrides):
    values = {
        "DATABASE_URL": "postgresql://user:pass@db.example.com:5432/app",
        "JWT_SECRET": "j" * 32,
        "BACKEND_INTERNAL_SECRET": "i" * 32,
        "FRONTEND_URL": "https://wholesale.pettravel.vn",
        "R2_ACCOUNT_ID": "account-id",
        "R2_ACCESS_KEY_ID": "access-key",
        "R2_SECRET_ACCESS_KEY": "secret-key",
        "R2_BUCKET": "pettravel-wholesale",
        "R2_PRIVATE_BUCKET": "pettravel-wholesale-private",
        "R2_PUBLIC_BASE_URL": "https://assets.pettravel.vn",
        "PAYMENT_QR_BANK_CODE": "MB",
        "PAYMENT_QR_ACCOUNT_NO": "0123456789",
        "PAYMENT_QR_ACCOUNT_NAME": "PET TRAVEL WHOLESALE",
        "VIETQR_WEBHOOK_SECRET": "w" * 32,
        "PAYMENT_SYSTEM_ACTOR_ID": "payment_system_actor",
    }
    values.update(overrides)
    return Settings(**values)


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


def test_production_configuration_validates_payment_secrets_and_urls(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    production_settings().validate_production_configuration()

    with pytest.raises(RuntimeError, match="VIETQR_WEBHOOK_SECRET"):
        production_settings(VIETQR_WEBHOOK_SECRET="short").validate_production_configuration()
    with pytest.raises(RuntimeError, match="PAYMENT_QR_ACCOUNT_NO"):
        production_settings(PAYMENT_QR_ACCOUNT_NO="account-with-letters").validate_production_configuration()
    with pytest.raises(RuntimeError, match="FRONTEND_URL"):
        production_settings(FRONTEND_URL="https://user:pass@example.com").validate_production_configuration()
    with pytest.raises(RuntimeError, match="R2_PRIVATE_BUCKET"):
        production_settings(R2_PRIVATE_BUCKET="pettravel-wholesale").validate_production_configuration()
