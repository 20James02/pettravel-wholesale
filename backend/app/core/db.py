from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from typing import AsyncGenerator
from app.core.config import settings

db_url = settings.async_database_url
if not db_url or not (db_url.startswith("postgresql") or db_url.startswith("sqlite") or db_url.startswith("postgres")):
    db_url = "sqlite+aiosqlite:///:memory:"

connect_args = {}
if "sslmode" in db_url:
    import urllib.parse as urlparse
    parsed = urlparse.urlparse(db_url)
    query_params = urlparse.parse_qs(parsed.query)
    query_params.pop("sslmode", None)
    new_query = urlparse.urlencode(query_params, doseq=True)
    db_url = urlparse.urlunparse(parsed._replace(query=new_query))
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
