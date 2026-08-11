import pytest
from fastapi import HTTPException

from app.core.security import get_password_hash
from app.models.wholesale import User
from app.routers.v1.endpoints.auth import LoginJsonInput, login_json


@pytest.mark.asyncio
async def test_login_json_returns_user_for_valid_credentials(db_session):
    db_session.add(
        User(
            id="u_auth_valid",
            email="owner@example.com",
            hashed_password=get_password_hash("CorrectPassword123"),
            name="Owner",
            phone="0900000000",
            role="super_admin",
            company="Pet Travel Wholesale",
        )
    )
    await db_session.commit()

    result = await login_json(
        LoginJsonInput(email="owner@example.com", password="CorrectPassword123"),
        db_session,
    )

    assert result["token_type"] == "bearer"
    assert result["access_token"]
    assert result["user"]["id"] == "u_auth_valid"
    assert result["user"]["role"] == "super_admin"


@pytest.mark.asyncio
async def test_login_json_rejects_invalid_stored_password_hash(db_session):
    db_session.add(
        User(
            id="u_auth_bad_hash",
            email="bad-hash@example.com",
            hashed_password="...",
            name="Bad Hash",
            role="customer_owner",
        )
    )
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await login_json(
            LoginJsonInput(email="bad-hash@example.com", password="CorrectPassword123"),
            db_session,
        )

    assert exc.value.status_code == 401
