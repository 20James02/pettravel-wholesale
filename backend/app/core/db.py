from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from typing import AsyncGenerator
from app.core.config import settings

db_url = settings.async_database_url
if not db_url or not (db_url.startswith("postgresql") or db_url.startswith("sqlite") or db_url.startswith("postgres")):
    db_url = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    db_url,
    echo=False,
    future=True,
    pool_pre_ping=True
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
