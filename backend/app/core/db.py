from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from typing import AsyncGenerator
from app.core.config import settings
from app.core.database_connection import build_database_connect_config

db_url = settings.async_database_url
if not db_url or not (db_url.startswith("postgresql") or db_url.startswith("sqlite") or db_url.startswith("postgres")):
    if settings.is_production:
        raise RuntimeError("Invalid production database URL.")
    db_url = "sqlite+aiosqlite:///:memory:"

db_url, connect_args = build_database_connect_config(
    db_url,
    ssl_mode=settings.DB_SSL_MODE or None,
    ssl_root_cert=settings.DB_SSL_ROOT_CERT or None,
)

engine = create_async_engine(
    db_url,
    echo=False,
    future=True,
    pool_pre_ping=True,
    connect_args=connect_args
)

async_session_maker = async_sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
