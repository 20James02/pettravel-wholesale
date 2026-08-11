from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from typing import AsyncGenerator
from app.core.config import settings

db_url = settings.async_database_url
if not db_url or not (db_url.startswith("postgresql") or db_url.startswith("sqlite") or db_url.startswith("postgres")):
    if settings.is_production:
        raise RuntimeError("Invalid production database URL.")
    db_url = "sqlite+aiosqlite:///:memory:"

connect_args = {}
if "?" in db_url:
    db_url = db_url.split("?")[0]

if "localhost" not in db_url and "127.0.0.1" not in db_url and "sqlite" not in db_url:
    connect_args["ssl"] = True

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
