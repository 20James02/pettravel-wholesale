import base64
from datetime import timedelta
import hashlib
import hmac
import json
from datetime import datetime, timezone

import pytest
from sqlalchemy import text
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.internal_auth import is_public_api_path
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.routers.v1.endpoints.auth import LoginJsonInput, login_json
from app.services.auth_rate_limit import (
    LOGIN_ATTEMPT_LIMIT,
    consume_login_rate_limit,
    digest_login_identifier,
)


def test_backend_login_endpoints_require_internal_bff_authentication(monkeypatch):
    assert not is_public_api_path("/api/v1/auth/login", "POST")
    assert not is_public_api_path("/api/v1/auth/login-json", "POST")
    monkeypatch.setattr(settings, "BACKEND_INTERNAL_SECRET", "test-internal-secret-32-characters-long")

    response = TestClient(app).post(
        "/api/v1/auth/login-json",
        json={"identifier": "owner@example.com", "password": "CorrectPassword123"},
    )

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("path", "method"),
    [
        ("/api/v1/products", "GET"),
        ("/api/v1/products/", "GET"),
        ("/api/v1/categories", "HEAD"),
        ("/api/v1/categories/", "HEAD"),
    ],
)
def test_public_catalog_paths_accept_an_optional_trailing_slash(path, method):
    assert is_public_api_path(path, method)


@pytest.mark.parametrize(
    "path",
    ["/api/v1/products", "/api/v1/products/", "/api/v1/categories", "/api/v1/categories/"],
)
def test_public_catalog_mutations_still_require_internal_authentication(path):
    assert not is_public_api_path(path, "POST")


def test_access_token_round_trip_uses_hs256():
    token = create_access_token("u_token_probe", expires_delta=timedelta(minutes=5))
    header_part, payload_part, signature_part = token.split(".")
    header = json.loads(base64.urlsafe_b64decode(header_part + "=="))
    payload = json.loads(base64.urlsafe_b64decode(payload_part + "=="))
    expected_signature = hmac.new(
        settings.jwt_secret.encode("utf-8"),
        f"{header_part}.{payload_part}".encode("ascii"),
        hashlib.sha256,
    ).digest()

    assert header == {"alg": "HS256", "typ": "JWT"}
    assert payload["sub"] == "u_token_probe"
    assert hmac.compare_digest(
        base64.urlsafe_b64decode(signature_part + "=="),
        expected_signature,
    )


@pytest.mark.asyncio
async def test_login_json_returns_canonical_user_role_and_organization(canonical_db_session):
    await canonical_db_session.execute(
        text("insert into organizations (id, name) values ('org_pettravel', 'Pet Travel Wholesale')")
    )
    await canonical_db_session.execute(
        text("""insert into app_users
            (id, organization_id, email, password_hash, full_name, phone, status)
            values (:id, :organization_id, :email, :password_hash, :full_name, :phone, 'active')"""),
        {
            "id": "u_auth_valid",
            "organization_id": "org_pettravel",
            "email": "owner@example.com",
            "password_hash": get_password_hash("CorrectPassword123"),
            "full_name": "Owner",
            "phone": "0900000000",
        },
    )
    await canonical_db_session.execute(
        text("insert into user_roles (user_id, role_id) values ('u_auth_valid', 'role_super_admin')")
    )
    await canonical_db_session.commit()

    result = await login_json(
        LoginJsonInput(email="owner@example.com", password="CorrectPassword123"),
        canonical_db_session,
    )

    assert result["token_type"] == "bearer"
    assert result["access_token"]
    assert result["user"]["id"] == "u_auth_valid"
    assert result["user"]["role"] == "super_admin"
    assert result["user"]["organizationId"] == "org_pettravel"
    assert result["user"]["company"] == "Pet Travel Wholesale"
    remaining_buckets = await canonical_db_session.scalar(
        text("select count(*) from auth_rate_limit_buckets")
    )
    assert remaining_buckets == 0


@pytest.mark.asyncio
async def test_login_json_rejects_invalid_stored_password_hash(canonical_db_session):
    await canonical_db_session.execute(
        text("""insert into app_users
            (id, email, password_hash, full_name, status)
            values ('u_auth_bad_hash', 'bad-hash@example.com', '...', 'Bad Hash', 'active')""")
    )
    await canonical_db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await login_json(
            LoginJsonInput(email="bad-hash@example.com", password="CorrectPassword123"),
            canonical_db_session,
        )

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_login_json_rejects_disabled_account(canonical_db_session):
    await canonical_db_session.execute(
        text("""insert into app_users
            (id, email, password_hash, full_name, status)
            values (:id, :email, :password_hash, :full_name, 'disabled')"""),
        {
            "id": "u_disabled",
            "email": "disabled@example.com",
            "password_hash": get_password_hash("CorrectPassword123"),
            "full_name": "Disabled User",
        },
    )
    await canonical_db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await login_json(
            LoginJsonInput(email="disabled@example.com", password="CorrectPassword123"),
            canonical_db_session,
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_login_json_distributed_rate_limit_is_persistent_and_pii_safe(canonical_db_session):
    identifier = "target-account@example.com"

    for _ in range(LOGIN_ATTEMPT_LIMIT):
        with pytest.raises(HTTPException) as exc:
            await login_json(
                LoginJsonInput(email=identifier, password="WrongPassword123"),
                canonical_db_session,
            )
        assert exc.value.status_code == 401

    with pytest.raises(HTTPException) as blocked:
        await login_json(
            LoginJsonInput(email=identifier, password="WrongPassword123"),
            canonical_db_session,
        )

    assert blocked.value.status_code == 429
    assert int(blocked.value.headers["Retry-After"]) > 0
    bucket = (
        await canonical_db_session.execute(
            text("select bucket_key, attempt_count from auth_rate_limit_buckets")
        )
    ).mappings().one()
    assert bucket["bucket_key"] == digest_login_identifier(identifier)
    assert identifier not in bucket["bucket_key"]
    assert bucket["attempt_count"] == LOGIN_ATTEMPT_LIMIT + 1


@pytest.mark.asyncio
async def test_distributed_rate_limit_purges_expired_buckets(canonical_db_session):
    first_window = datetime(2026, 8, 22, 1, 0, tzinfo=timezone.utc)
    await consume_login_rate_limit(
        canonical_db_session,
        "expired@example.com",
        now=first_window,
    )
    await consume_login_rate_limit(
        canonical_db_session,
        "current@example.com",
        now=first_window + timedelta(minutes=6),
    )

    keys = (
        await canonical_db_session.execute(
            text("select bucket_key from auth_rate_limit_buckets")
        )
    ).scalars().all()
    assert keys == [digest_login_identifier("current@example.com")]
