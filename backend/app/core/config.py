from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Pet Travel Wholesale B2B API"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "supersecretkeychangeinproduction"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/pettravel"
    
    @property
    def jwt_secret(self) -> str:
        import os
        return os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or self.SECRET_KEY

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
            os.getenv("DATABASE_URL")
            or os.getenv("POSTGRES_URL")
            or os.getenv("SUPABASE_DB_URL")
            or self.DATABASE_URL
        )
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
