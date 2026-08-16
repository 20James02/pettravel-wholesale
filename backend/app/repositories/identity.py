from __future__ import annotations

import time
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_users_list_cache: tuple[float, list[dict[str, Any]]] | None = None
USERS_LIST_CACHE_TTL = 30.0  # 30 seconds


def invalidate_users_cache() -> None:
    global _users_list_cache
    _users_list_cache = None


_USER_PROJECTION = """
    select
        u.id,
        u.organization_id,
        u.full_name,
        u.email,
        u.phone,
        u.password_hash,
        u.status,
        u.created_at,
        o.name as company,
        coalesce(
            (
                select r.key
                from user_roles ur
                join roles r on r.id = ur.role_id
                where ur.user_id = u.id
                order by case r.key
                    when 'super_admin' then 1
                    when 'admin_manager' then 2
                    when 'order_operator' then 3
                    when 'accountant' then 4
                    when 'warehouse' then 5
                    when 'customer_owner' then 6
                    when 'customer_staff' then 7
                    else 99
                end
                limit 1
            ),
            'customer_owner'
        ) as role
    from app_users u
    left join organizations o on o.id = u.organization_id
"""


async def get_user_by_email(db: AsyncSession, email: str) -> dict[str, Any] | None:
    result = await db.execute(
        text(f"{_USER_PROJECTION} where lower(u.email) = lower(:email) limit 1"),
        {"email": email.strip()},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def get_user_by_id(db: AsyncSession, user_id: str) -> dict[str, Any] | None:
    result = await db.execute(
        text(f"{_USER_PROJECTION} where u.id = :user_id limit 1"),
        {"user_id": user_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def get_user_permissions(db: AsyncSession, user_id: str) -> list[str]:
    result = await db.execute(
        text("""select distinct rp.permission_key
            from user_roles ur
            join role_permissions rp on rp.role_id = ur.role_id
            where ur.user_id = :user_id
            order by rp.permission_key"""),
        {"user_id": user_id},
    )
    return [str(row[0]) for row in result.all()]


async def list_users(db: AsyncSession) -> list[dict[str, Any]]:
    global _users_list_cache
    now = time.monotonic()
    if _users_list_cache is not None:
        cached_time, cached_data = _users_list_cache
        if now - cached_time < USERS_LIST_CACHE_TTL:
            return cached_data

    result = await db.execute(
        text(f"{_USER_PROJECTION} where u.status != 'disabled' order by u.created_at desc, u.id")
    )
    users = [dict(row) for row in result.mappings().all()]
    _users_list_cache = (now, users)
    return users


async def list_role_permissions(db: AsyncSession) -> dict[str, list[str]]:
    result = await db.execute(
        text("""select r.key as role_key, rp.permission_key
            from roles r
            left join role_permissions rp on rp.role_id = r.id
            order by r.key, rp.permission_key""")
    )
    output: dict[str, list[str]] = {}
    for row in result.mappings():
        permissions = output.setdefault(str(row["role_key"]), [])
        if row["permission_key"] is not None:
            permissions.append(str(row["permission_key"]))
    return output
