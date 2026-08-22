import re
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Pet Travel Wholesale B2B API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    
    # Security
    SECRET_KEY: str = "supersecretkeychangeinproduction"
    JWT_SECRET: str = ""
    BACKEND_INTERNAL_SECRET: str = ""
    ALLOW_DEMO_DATA: bool = False
    ALLOW_RUNTIME_MIGRATIONS: bool = False
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/pettravel"
    POSTGRES_URL: str = ""
    DB_SSL_MODE: str = ""
    DB_SSL_ROOT_CERT: str = ""
    
    @property
    def jwt_secret(self) -> str:
        secret = self.JWT_SECRET.strip() or self.SECRET_KEY.strip()
        if self.is_production and len(secret) < 32:
            raise RuntimeError("JWT_SECRET must be configured with at least 32 characters in production.")
        return secret

    @property
    def is_production(self) -> bool:
        import os
        environment = (
            os.getenv("ENVIRONMENT")
            or os.getenv("VERCEL_ENV")
            or os.getenv("NODE_ENV")
            or self.ENVIRONMENT
        )
        return environment.lower() in {"production", "prod"}

    # Cloudflare R2
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET: str = "pettravel-wholesale"
    R2_PRIVATE_BUCKET: str = "pettravel-wholesale-private"
    R2_PUBLIC_BASE_URL: str = "https://pub-example.r2.dev"

    # VietQR Payment
    PAYMENT_QR_BANK_CODE: str = ""
    PAYMENT_QR_ACCOUNT_NO: str = ""
    PAYMENT_QR_ACCOUNT_NAME: str = "PET TRAVEL WHOLESALE"
    VIETQR_WEBHOOK_SECRET: str = ""
    PAYMENT_SYSTEM_ACTOR_ID: str = ""

    @property
    def async_database_url(self) -> str:
        url = (
            self.POSTGRES_URL.strip()
            if self.is_production and self.POSTGRES_URL.strip()
            else self.DATABASE_URL.strip()
        )
        if self.is_production and url == "postgresql+asyncpg://postgres:postgres@localhost:5432/pettravel":
            raise RuntimeError("A production PostgreSQL database URL must be configured.")
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url
    
    # CORS
    FRONTEND_URL: str = ""

    @property
    def cors_origins(self) -> list[str]:
        origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
        frontend_url = self.FRONTEND_URL.strip().rstrip("/")
        if frontend_url:
            origins.append(frontend_url)
        return origins

    def validate_production_configuration(self) -> None:
        if not self.is_production:
            return

        errors: list[str] = []
        database_url = self.async_database_url
        parsed_database = urlparse(
            database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        )

        if parsed_database.scheme != "postgresql" or not parsed_database.hostname:
            errors.append("DATABASE_URL must be a valid PostgreSQL connection URL")
        if parsed_database.hostname in {"localhost", "127.0.0.1", "::1"}:
            errors.append("DATABASE_URL must not target localhost")
        if len(self.JWT_SECRET.strip()) < 32:
            errors.append("JWT_SECRET must contain at least 32 characters")
        if len(self.BACKEND_INTERNAL_SECRET.strip()) < 32:
            errors.append("BACKEND_INTERNAL_SECRET must contain at least 32 characters")
        if self.ALLOW_DEMO_DATA:
            errors.append("ALLOW_DEMO_DATA must be false")
        if self.ALLOW_RUNTIME_MIGRATIONS:
            errors.append("ALLOW_RUNTIME_MIGRATIONS must be false")
        parsed_frontend = urlparse(self.FRONTEND_URL.strip())
        if (
            parsed_frontend.scheme != "https"
            or not parsed_frontend.netloc
            or parsed_frontend.username
            or parsed_frontend.password
        ):
            errors.append("FRONTEND_URL must be an HTTPS URL")

        r2_values = {
            "R2_ACCOUNT_ID": self.R2_ACCOUNT_ID,
            "R2_ACCESS_KEY_ID": self.R2_ACCESS_KEY_ID,
            "R2_SECRET_ACCESS_KEY": self.R2_SECRET_ACCESS_KEY,
            "R2_BUCKET": self.R2_BUCKET,
            "R2_PRIVATE_BUCKET": self.R2_PRIVATE_BUCKET,
            "R2_PUBLIC_BASE_URL": self.R2_PUBLIC_BASE_URL,
        }
        for key, value in r2_values.items():
            if not value.strip() or "example" in value.lower():
                errors.append(f"{key} must be configured")
        parsed_r2 = urlparse(self.R2_PUBLIC_BASE_URL.strip())
        if parsed_r2.scheme != "https" or not parsed_r2.netloc:
            errors.append("R2_PUBLIC_BASE_URL must be an HTTPS URL")
        if self.R2_PRIVATE_BUCKET.strip() == self.R2_BUCKET.strip():
            errors.append("R2_PRIVATE_BUCKET must be different from the public R2_BUCKET")

        payment_values = {
            "PAYMENT_QR_BANK_CODE": self.PAYMENT_QR_BANK_CODE,
            "PAYMENT_QR_ACCOUNT_NO": self.PAYMENT_QR_ACCOUNT_NO,
            "PAYMENT_QR_ACCOUNT_NAME": self.PAYMENT_QR_ACCOUNT_NAME,
        }
        for key, value in payment_values.items():
            if not value.strip() or "example" in value.lower():
                errors.append(f"{key} must be configured")
        if self.PAYMENT_QR_BANK_CODE and not re.fullmatch(r"[A-Za-z0-9_-]{2,20}", self.PAYMENT_QR_BANK_CODE):
            errors.append("PAYMENT_QR_BANK_CODE has invalid format")
        if self.PAYMENT_QR_ACCOUNT_NO and not re.fullmatch(r"[0-9]{6,30}", self.PAYMENT_QR_ACCOUNT_NO):
            errors.append("PAYMENT_QR_ACCOUNT_NO has invalid format")
        if len(self.VIETQR_WEBHOOK_SECRET.strip()) < 32:
            errors.append("VIETQR_WEBHOOK_SECRET must contain at least 32 characters")
        if not self.PAYMENT_SYSTEM_ACTOR_ID.strip():
            errors.append("PAYMENT_SYSTEM_ACTOR_ID must be configured")

        if errors:
            raise RuntimeError("Invalid production configuration: " + "; ".join(errors))
    
    model_config = SettingsConfigDict(
        env_file=(".env.backend", ".env.local", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
