from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Pet Travel Wholesale B2B API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    
    # Security
    SECRET_KEY: str = "supersecretkeychangeinproduction"
    JWT_SECRET: str = ""
    SUPABASE_JWT_SECRET: str = ""
    BACKEND_INTERNAL_SECRET: str = ""
    ALLOW_DEMO_DATA: bool = False
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/pettravel"
    
    @property
    def jwt_secret(self) -> str:
        import os
        secret = (
            os.getenv("JWT_SECRET")
            or os.getenv("SUPABASE_JWT_SECRET")
            or os.getenv("SECRET_KEY")
            or self.JWT_SECRET
            or self.SUPABASE_JWT_SECRET
            or self.SECRET_KEY
        )
        if self.is_production and secret == "supersecretkeychangeinproduction":
            raise RuntimeError("JWT_SECRET, SUPABASE_JWT_SECRET, or SECRET_KEY must be configured in production.")
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
    R2_PUBLIC_BASE_URL: str = "https://pub-example.r2.dev"

    # VietQR Payment
    PAYMENT_QR_BANK_NAME: str = "Pet Travel"
    PAYMENT_QR_ACCOUNT_NO: str = ""
    PAYMENT_QR_ACCOUNT_NAME: str = "PET TRAVEL WHOLESALE"

    @property
    def async_database_url(self) -> str:
        import os
        url = (
            os.getenv("POSTGRES_URL")
            or os.getenv("DATABASE_URL")
            or os.getenv("SUPABASE_DB_URL")
            or self.DATABASE_URL
        )
        if self.is_production and url == "postgresql+asyncpg://postgres:postgres@localhost:5432/pettravel":
            raise RuntimeError("A production PostgreSQL database URL must be configured.")
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )

settings = Settings()
