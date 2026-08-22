from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


LOGIN_ATTEMPT_LIMIT = 8
LOGIN_WINDOW_SECONDS = 5 * 60


@dataclass(frozen=True)
class AuthRateLimitResult:
    allowed: bool
    remaining: int
    retry_after_seconds: int


def digest_login_identifier(identifier: str) -> str:
    normalized = identifier.strip().casefold()
    return hashlib.sha256(f"login:{normalized}".encode("utf-8")).hexdigest()


def _as_utc(value: datetime | str) -> datetime:
    parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


async def consume_login_rate_limit(
    db: AsyncSession,
    identifier: str,
    *,
    now: datetime | None = None,
) -> AuthRateLimitResult:
    current_time = now or datetime.now(timezone.utc)
    window_expires_at = current_time + timedelta(seconds=LOGIN_WINDOW_SECONDS)
    bucket_key = digest_login_identifier(identifier)

    await db.execute(
        text("DELETE FROM auth_rate_limit_buckets WHERE window_expires_at <= :current_time"),
        {"current_time": current_time},
    )
    result = await db.execute(
        text(
            """
            INSERT INTO auth_rate_limit_buckets
              (bucket_key, attempt_count, window_expires_at, updated_at)
            VALUES (:bucket_key, 1, :window_expires_at, :current_time)
            ON CONFLICT (bucket_key) DO UPDATE SET
              attempt_count = CASE
                WHEN auth_rate_limit_buckets.window_expires_at <= :current_time THEN 1
                ELSE auth_rate_limit_buckets.attempt_count + 1
              END,
              window_expires_at = CASE
                WHEN auth_rate_limit_buckets.window_expires_at <= :current_time THEN :window_expires_at
                ELSE auth_rate_limit_buckets.window_expires_at
              END,
              updated_at = :current_time
            RETURNING attempt_count, window_expires_at
            """
        ),
        {
            "bucket_key": bucket_key,
            "current_time": current_time,
            "window_expires_at": window_expires_at,
        },
    )
    row = result.mappings().one()

    # Authentication failures raise HTTPException, and get_db rolls back failed
    # request transactions. Commit the security counter before authentication so
    # failed attempts remain visible to every backend instance.
    await db.commit()

    attempt_count = int(row["attempt_count"])
    expires_at = _as_utc(row["window_expires_at"])
    retry_after = max(1, int((expires_at - current_time).total_seconds() + 0.999))
    return AuthRateLimitResult(
        allowed=attempt_count <= LOGIN_ATTEMPT_LIMIT,
        remaining=max(0, LOGIN_ATTEMPT_LIMIT - attempt_count),
        retry_after_seconds=0 if attempt_count <= LOGIN_ATTEMPT_LIMIT else retry_after,
    )


async def reset_login_rate_limit(db: AsyncSession, identifier: str) -> None:
    await db.execute(
        text("DELETE FROM auth_rate_limit_buckets WHERE bucket_key = :bucket_key"),
        {"bucket_key": digest_login_identifier(identifier)},
    )
    await db.commit()
