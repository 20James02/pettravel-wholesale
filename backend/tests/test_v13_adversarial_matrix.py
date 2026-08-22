from __future__ import annotations

import os
import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.repositories.orders import OrderConflictError, save_order
from app.routers.v1.endpoints.orders import _parse_positive_vnd, vietqr_webhook


def test_webhook_vnd_parser_rejects_fractional_boolean_and_out_of_range_values():
    assert _parse_positive_vnd(100_000) == 100_000
    assert _parse_positive_vnd("100000") == 100_000
    for invalid in (100_000.9, "100000.9", True, 0, -1, 1_000_000_000_001, None):
        with pytest.raises(HTTPException):
            _parse_positive_vnd(invalid)


# ── ADVERSARIAL MATRIX Q1-Q7 (QUOTE ACCEPTANCE & IMMUTABILITY) ──

@pytest.mark.asyncio
async def test_adversarial_q1_stale_quote_version_rejected(canonical_db_session):
    """Q1: Stale quote version acceptance rejected with OrderConflictError (QUOTE_STALE)."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_q1', 'Org Q1')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('cust_q1', 'org_q1', 'Khach Q1', 'q1@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_q1', 'PTW-Q1', 'org_q1', 'cust_q1', 'quoted', 'unrequested',
                    'deposit_cod', 2, '2026-08-18 10:00:00')""")
    )
    # Stale quote version 1 (current is 2)
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining,
             expires_at, published_by)
            values ('qv_q1_v1', 'ord_q1', 1, 'published', 1000000, 1000000, 300000, 700000,
                    '2030-01-01 00:00:00', 'cust_q1')""")
    )
    await canonical_db_session.commit()

    with pytest.raises(OrderConflictError, match="QUOTE_STALE|phiên bản hiện hành"):
        await save_order(
            canonical_db_session,
            actor_id="cust_q1",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_q1",
                "commercialStatus": "customer_accepted",
                "acceptedQuoteId": "qv_q1_v1",
                "acceptedQuoteVersion": 1,
            },
        )


@pytest.mark.asyncio
async def test_adversarial_q2_expired_quote_rejected(canonical_db_session):
    """Q2: Expired quote acceptance rejected with OrderConflictError (QUOTE_EXPIRED)."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_q2', 'Org Q2')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('cust_q2', 'org_q2', 'Khach Q2', 'q2@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_q2', 'PTW-Q2', 'org_q2', 'cust_q2', 'quoted', 'unrequested',
                    'deposit_cod', 1, '2026-08-18 10:00:00')""")
    )
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining,
             expires_at, published_by)
            values ('qv_q2', 'ord_q2', 1, 'published', 1000000, 1000000, 300000, 700000,
                    '2020-01-01 00:00:00', 'cust_q2')""")
    )
    await canonical_db_session.commit()

    with pytest.raises(OrderConflictError, match="QUOTE_EXPIRED|hết hạn"):
        await save_order(
            canonical_db_session,
            actor_id="cust_q2",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_q2",
                "commercialStatus": "customer_accepted",
                "acceptedQuoteId": "qv_q2",
                "acceptedQuoteVersion": 1,
            },
        )


@pytest.mark.asyncio
async def test_adversarial_q3_superseded_quote_rejected(canonical_db_session):
    """Q3: Acceptance of superseded quote rejected with OrderConflictError."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_q3', 'Org Q3')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('cust_q3', 'org_q3', 'Khach Q3', 'q3@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_q3', 'PTW-Q3', 'org_q3', 'cust_q3', 'quoted', 'unrequested',
                    'deposit_cod', 1, '2026-08-18 10:00:00')""")
    )
    # Quote status is already superseded
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining,
             expires_at, published_by)
            values ('qv_q3', 'ord_q3', 1, 'superseded', 1000000, 1000000, 300000, 700000,
                    '2030-01-01 00:00:00', 'cust_q3')""")
    )
    await canonical_db_session.commit()

    with pytest.raises(OrderConflictError, match="QUOTE_STALE_OR_INVALID|không tồn tại"):
        await save_order(
            canonical_db_session,
            actor_id="cust_q3",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_q3",
                "commercialStatus": "customer_accepted",
                "acceptedQuoteId": "qv_q3",
                "acceptedQuoteVersion": 1,
            },
        )


@pytest.mark.asyncio
async def test_adversarial_q4_unapproved_adjustment_quote_rejected(canonical_db_session):
    """Q4: Acceptance of quote with unapproved adjustment rejected with OrderConflictError."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_q4', 'Org Q4')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('cust_q4', 'org_q4', 'Khach Q4', 'q4@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_q4', 'PTW-Q4', 'org_q4', 'cust_q4', 'quoted', 'unrequested',
                    'deposit_cod', 1, '2026-08-18 10:00:00')""")
    )
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining,
             expires_at, published_by)
            values ('qv_q4', 'ord_q4', 1, 'published', 1000000, 900000, 270000, 630000,
                    '2030-01-01 00:00:00', 'cust_q4')""")
    )
    # Adjustment requires approval and approved_by is NULL
    await canonical_db_session.execute(
        text("""insert into quote_adjustments
            (id, quote_id, type, label, amount, requires_approval, approved_by)
            values ('adj_q4', 'qv_q4', 'discount', 'Khuyến mãi đặc biệt', -100000, true, NULL)""")
    )
    await canonical_db_session.commit()

    with pytest.raises(OrderConflictError, match="QUOTE_APPROVAL_REQUIRED|chưa được phê duyệt"):
        await save_order(
            canonical_db_session,
            actor_id="cust_q4",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_q4",
                "commercialStatus": "customer_accepted",
                "acceptedQuoteId": "qv_q4",
                "acceptedQuoteVersion": 1,
            },
        )


@pytest.mark.asyncio
async def test_adversarial_q5_q6_cas_concurrency_conflict(canonical_db_session):
    """Q5 & Q6: CAS updated_at check rejects concurrent conflicting updates."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_cas', 'Org CAS')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('cust_cas', 'org_cas', 'Khach CAS', 'cas@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_cas', 'PTW-CAS', 'org_cas', 'cust_cas', 'quoted', 'unrequested',
                    'deposit_cod', 1, '2026-08-18 10:00:00')""")
    )
    await canonical_db_session.commit()

    # Client sends stale expected_updated_at (2026-08-18T09:00:00 != 2026-08-18 10:00:00)
    with pytest.raises(OrderConflictError, match="cập nhật bởi phiên làm việc khác"):
        await save_order(
            canonical_db_session,
            actor_id="cust_cas",
            expected_updated_at="2026-08-18T09:00:00",
            order={
                "id": "ord_cas",
                "commercialStatus": "customer_accepted",
                "acceptedQuoteId": "qv_any",
                "acceptedQuoteVersion": 1,
            },
        )


@pytest.mark.asyncio
async def test_adversarial_q7_admin_cannot_accept_quote_or_mutate_locked_items(canonical_db_session):
    """Q7: Admin cannot set quote status to accepted directly or mutate locked order items."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_seller', 'Pet Travel')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('admin_q7', 'org_seller', 'Admin Q7', 'admin_q7@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("insert into user_roles (user_id, role_id) values ('admin_q7', 'role_super_admin')")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_q7', 'PTW-Q7', 'org_seller', 'admin_q7', 'quoted', 'unrequested',
                    'deposit_cod', 1, '2026-08-18 10:00:00')""")
    )
    await canonical_db_session.execute(
        text("""insert into order_items
            (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot,
             variant_label_snapshot, supplier_id, quantity, unit_price_snapshot, locked)
            values ('oi_q7', 'ord_q7', 'P-7', 'Item 7', 'SKU-7', 'Label 7', 'sup_1', 1, 100000, true)""")
    )
    await canonical_db_session.commit()

    # 1. Admin sends status = 'accepted' on quote -> REJECTED
    with pytest.raises(ValueError, match="ADMIN_CANNOT_ACCEPT_QUOTE"):
        await save_order(
            canonical_db_session,
            actor_id="admin_q7",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_q7",
                "quoteVersions": [
                    {
                        "id": "qv_q7",
                        "version": 2,
                        "status": "accepted",
                        "subtotal": 100000,
                        "finalTotal": 100000,
                        "depositAmount": 30000,
                        "codRemaining": 70000,
                    }
                ],
            },
        )

    # 2. Mutating items on locked order -> REJECTED
    with pytest.raises(ValueError, match="LOCKED_ITEM_IMMUTABLE|Không thể chỉnh sửa"):
        await save_order(
            canonical_db_session,
            actor_id="admin_q7",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_q7",
                "items": [{"variantSku": "SKU-7", "supplierId": "sup_1", "quantity": 5}],
            },
        )


# ── ADVERSARIAL MATRIX P1-P7 (VIETQR WEBHOOK & IDEMPOTENCY) ──

@pytest.mark.asyncio
async def test_adversarial_p1_invalid_signature_rejected(canonical_db_session, monkeypatch):
    """P1: Webhook with invalid signature rejected with 401."""
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "valid-secret-123")

    with pytest.raises(HTTPException) as excinfo:
        await vietqr_webhook(
            payload={"reference": "PTW-REF-P1", "amount": 300000},
            x_webhook_secret="wrong-secret-999",
            db=canonical_db_session,
        )
    assert excinfo.value.status_code == 401


@pytest.mark.asyncio
async def test_adversarial_p2_unconfigured_secret_rejected(canonical_db_session, monkeypatch):
    """P2: Webhook without configured secret rejected with 503."""
    monkeypatch.delenv("VIETQR_WEBHOOK_SECRET", raising=False)

    with pytest.raises(HTTPException) as excinfo:
        await vietqr_webhook(
            payload={"reference": "PTW-REF-P2", "amount": 300000},
            x_webhook_secret="any-secret",
            db=canonical_db_session,
        )
    assert excinfo.value.status_code == 503
    assert "PAYMENT_WEBHOOK_NOT_CONFIGURED" in str(excinfo.value.detail)


@pytest.mark.asyncio
async def test_adversarial_p3_p4_amount_mismatch_rejected(canonical_db_session, monkeypatch):
    """P3 & P4: Amount mismatch (underpayment or overpayment) rejected with 400 PAYMENT_AMOUNT_MISMATCH."""
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "secret-123")

    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_p3', 'Org P3')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('user_p3', 'org_p3', 'User P3', 'p3@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_p3', 'PTW-P3', 'org_p3', 'user_p3', 'customer_accepted', 'deposit_requested',
                    'deposit_cod', 1, '2026-08-18 10:00:00')""")
    )
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            values ('qv_p3', 'ord_p3', 1, 'accepted', 1000000, 1000000, 300000, 700000, '2030-01-01 00:00:00')""")
    )
    await canonical_db_session.execute(
        text("""insert into payment_requests
            (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
            values ('pr_p3', 'ord_p3', 'qv_p3', 'deposit', 300000, 'REF-P3-MISMATCH', 'payload', 'active', '2030-01-01 00:00:00')""")
    )
    await canonical_db_session.commit()

    # Underpayment: 200,000 < 300,000 -> 400
    with pytest.raises(HTTPException) as exc1:
        await vietqr_webhook(
            payload={"reference": "REF-P3-MISMATCH", "amount": 200000},
            x_webhook_secret="secret-123",
            db=canonical_db_session,
        )
    assert exc1.value.status_code == 400
    assert "PAYMENT_AMOUNT_MISMATCH" in str(exc1.value.detail)

    # Amount mismatch: 350,000 != 300,000 -> 400
    with pytest.raises(HTTPException) as exc2:
        await vietqr_webhook(
            payload={"reference": "REF-P3-MISMATCH", "amount": 350000},
            x_webhook_secret="secret-123",
            db=canonical_db_session,
        )
    assert exc2.value.status_code == 400
    assert "PAYMENT_AMOUNT_MISMATCH" in str(exc2.value.detail)


@pytest.mark.asyncio
async def test_adversarial_p5_idempotent_confirmed_payment_replay(canonical_db_session, monkeypatch):
    """P5: Idempotent replay of confirmed payment succeeds with idempotent=True."""
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "secret-123")

    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_p5', 'Org P5')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('user_p5', 'org_p5', 'User P5', 'p5@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_p5', 'PTW-P5', 'org_p5', 'user_p5', 'customer_accepted', 'deposit_confirmed',
                    'deposit_cod', 1, '2026-08-18 10:00:00')""")
    )
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            values ('qv_p5', 'ord_p5', 1, 'accepted', 1000000, 1000000, 300000, 700000, '2030-01-01 00:00:00')""")
    )
    # Payment request already confirmed
    await canonical_db_session.execute(
        text("""insert into payment_requests
            (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
            values ('pr_p5', 'ord_p5', 'qv_p5', 'deposit', 300000, 'REF-P5-IDEMPOTENT', 'payload', 'confirmed', '2030-01-01 00:00:00')""")
    )
    await canonical_db_session.commit()

    res = await vietqr_webhook(
        payload={"reference": "REF-P5-IDEMPOTENT", "amount": 300000},
        x_webhook_secret="secret-123",
        db=canonical_db_session,
    )
    assert res["status"] == "success"
    assert res["idempotent"] is True

    with pytest.raises(HTTPException) as conflicting_replay:
        await vietqr_webhook(
            payload={"reference": "REF-P5-IDEMPOTENT", "amount": 300001},
            x_webhook_secret="secret-123",
            db=canonical_db_session,
        )
    assert "PAYMENT_AMOUNT_MISMATCH" in str(conflicting_replay.value.detail)


@pytest.mark.asyncio
async def test_adversarial_p6_p7_expired_or_missing_payment_rejected(canonical_db_session, monkeypatch):
    """P6 & P7: Expired or missing payment request rejected."""
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "secret-123")

    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_p6', 'Org P6')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('user_p6', 'org_p6', 'User P6', 'p6@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, commercial_status, payment_status,
             payment_intent, current_quote_version, updated_at)
            values ('ord_p6', 'PTW-P6', 'org_p6', 'user_p6', 'customer_accepted', 'deposit_requested',
                    'deposit_cod', 1, '2026-08-18 10:00:00')""")
    )
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            values ('qv_p6', 'ord_p6', 1, 'accepted', 1000000, 1000000, 300000, 700000, '2030-01-01 00:00:00')""")
    )
    # Payment request expired
    await canonical_db_session.execute(
        text("""insert into payment_requests
            (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
            values ('pr_p6', 'ord_p6', 'qv_p6', 'deposit', 300000, 'REF-P6-EXPIRED', 'payload', 'active', '2020-01-01 00:00:00')""")
    )
    await canonical_db_session.commit()

    # Expired request -> 400
    with pytest.raises(HTTPException) as exc_exp:
        await vietqr_webhook(
            payload={"reference": "REF-P6-EXPIRED", "amount": 300000},
            x_webhook_secret="secret-123",
            db=canonical_db_session,
        )
    assert exc_exp.value.status_code == 400
    assert "PAYMENT_REQUEST_EXPIRED" in str(exc_exp.value.detail)

    # Non-existent reference -> 404
    with pytest.raises(HTTPException) as exc_404:
        await vietqr_webhook(
            payload={"reference": "REF-DOES-NOT-EXIST", "amount": 300000},
            x_webhook_secret="secret-123",
            db=canonical_db_session,
        )
    assert exc_404.value.status_code == 404


# ── PAYMENT SYSTEM ACTOR EXACT CONFIGURATION MATRIX (P-ACTOR-1..6) ──

@pytest.mark.asyncio
async def test_p_actor_1_missing_env_var_returns_503(canonical_db_session, monkeypatch):
    """P-ACTOR-1: PAYMENT_SYSTEM_ACTOR_ID not configured in env -> 503 PAYMENT_SYSTEM_ACTOR_NOT_CONFIGURED."""
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "secret-pactor")
    monkeypatch.delenv("PAYMENT_SYSTEM_ACTOR_ID", raising=False)

    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_pa1', 'Org PA1')"))
    await canonical_db_session.execute(
        text("insert into app_users (id, organization_id, full_name, email, status) values ('u_pa1', 'org_pa1', 'User PA1', 'pa1@example.com', 'active')")
    )
    await canonical_db_session.execute(
        text("insert into customer_orders (id, order_number, organization_id, created_by, payment_intent) values ('ord_pa1', 'PTW-PA1', 'org_pa1', 'u_pa1', 'deposit_cod')")
    )
    await canonical_db_session.execute(
        text("insert into quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at) values ('qv_pa1', 'ord_pa1', 1, 'accepted', 1000, 1000, 300, 700, '2030-01-01')")
    )
    await canonical_db_session.execute(
        text("insert into payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at) values ('pr_pa1', 'ord_pa1', 'qv_pa1', 'deposit', 300, 'REF-PA1', 'qr', 'active', '2030-01-01')")
    )
    await canonical_db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await vietqr_webhook(
            payload={"reference": "REF-PA1", "amount": 300},
            x_webhook_secret="secret-pactor",
            db=canonical_db_session,
        )
    assert exc.value.status_code == 503
    assert "PAYMENT_SYSTEM_ACTOR_NOT_CONFIGURED" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_p_actor_2_empty_env_var_returns_503(canonical_db_session, monkeypatch):
    """P-ACTOR-2: PAYMENT_SYSTEM_ACTOR_ID empty string in env -> 503 PAYMENT_SYSTEM_ACTOR_NOT_CONFIGURED."""
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "secret-pactor")
    monkeypatch.setenv("PAYMENT_SYSTEM_ACTOR_ID", "   ")

    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_pa2', 'Org PA2')"))
    await canonical_db_session.execute(
        text("insert into app_users (id, organization_id, full_name, email, status) values ('u_pa2', 'org_pa2', 'User PA2', 'pa2@example.com', 'active')")
    )
    await canonical_db_session.execute(
        text("insert into customer_orders (id, order_number, organization_id, created_by, payment_intent) values ('ord_pa2', 'PTW-PA2', 'org_pa2', 'u_pa2', 'deposit_cod')")
    )
    await canonical_db_session.execute(
        text("insert into quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at) values ('qv_pa2', 'ord_pa2', 1, 'accepted', 1000, 1000, 300, 700, '2030-01-01')")
    )
    await canonical_db_session.execute(
        text("insert into payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at) values ('pr_pa2', 'ord_pa2', 'qv_pa2', 'deposit', 300, 'REF-PA2', 'qr', 'active', '2030-01-01')")
    )
    await canonical_db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await vietqr_webhook(
            payload={"reference": "REF-PA2", "amount": 300},
            x_webhook_secret="secret-pactor",
            db=canonical_db_session,
        )
    assert exc.value.status_code == 503
    assert "PAYMENT_SYSTEM_ACTOR_NOT_CONFIGURED" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_p_actor_3_non_existent_actor_returns_503(canonical_db_session, monkeypatch):
    """P-ACTOR-3: Configured actor ID does not exist in DB -> 503 PAYMENT_SYSTEM_ACTOR_INVALID."""
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "secret-pactor")
    monkeypatch.setenv("PAYMENT_SYSTEM_ACTOR_ID", "user_non_existent_999")

    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_pa3', 'Org PA3')"))
    await canonical_db_session.execute(
        text("insert into app_users (id, organization_id, full_name, email, status) values ('u_pa3', 'org_pa3', 'User PA3', 'pa3@example.com', 'active')")
    )
    await canonical_db_session.execute(
        text("insert into customer_orders (id, order_number, organization_id, created_by, payment_intent) values ('ord_pa3', 'PTW-PA3', 'org_pa3', 'u_pa3', 'deposit_cod')")
    )
    await canonical_db_session.execute(
        text("insert into quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at) values ('qv_pa3', 'ord_pa3', 1, 'accepted', 1000, 1000, 300, 700, '2030-01-01')")
    )
    await canonical_db_session.execute(
        text("insert into payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at) values ('pr_pa3', 'ord_pa3', 'qv_pa3', 'deposit', 300, 'REF-PA3', 'qr', 'active', '2030-01-01')")
    )
    await canonical_db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await vietqr_webhook(
            payload={"reference": "REF-PA3", "amount": 300},
            x_webhook_secret="secret-pactor",
            db=canonical_db_session,
        )
    assert exc.value.status_code == 503
    assert "PAYMENT_SYSTEM_ACTOR_INVALID" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_p_actor_4_inactive_actor_returns_503(canonical_db_session, monkeypatch):
    """P-ACTOR-4: Configured actor is inactive -> 503 PAYMENT_SYSTEM_ACTOR_INVALID."""
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "secret-pactor")
    monkeypatch.setenv("PAYMENT_SYSTEM_ACTOR_ID", "user_inactive_pa4")

    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_pa4', 'Org PA4')"))
    await canonical_db_session.execute(
        text("insert into app_users (id, organization_id, full_name, email, status) values ('user_inactive_pa4', 'org_pa4', 'Inactive User', 'inact@example.com', 'suspended')")
    )
    await canonical_db_session.execute(
        text("insert into customer_orders (id, order_number, organization_id, created_by, payment_intent) values ('ord_pa4', 'PTW-PA4', 'org_pa4', 'user_inactive_pa4', 'deposit_cod')")
    )
    await canonical_db_session.execute(
        text("insert into quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at) values ('qv_pa4', 'ord_pa4', 1, 'accepted', 1000, 1000, 300, 700, '2030-01-01')")
    )
    await canonical_db_session.execute(
        text("insert into payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at) values ('pr_pa4', 'ord_pa4', 'qv_pa4', 'deposit', 300, 'REF-PA4', 'qr', 'active', '2030-01-01')")
    )
    await canonical_db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await vietqr_webhook(
            payload={"reference": "REF-PA4", "amount": 300},
            x_webhook_secret="secret-pactor",
            db=canonical_db_session,
        )
    assert exc.value.status_code == 503
    assert "PAYMENT_SYSTEM_ACTOR_INVALID" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_p_actor_5_forbidden_actor_returns_503(canonical_db_session, monkeypatch):
    """P-ACTOR-5: Configured actor lacks order.confirm_payment -> 503 PAYMENT_SYSTEM_ACTOR_FORBIDDEN."""
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "secret-pactor")
    monkeypatch.setenv("PAYMENT_SYSTEM_ACTOR_ID", "user_unauth_pa5")

    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_pa5', 'Org PA5')"))
    await canonical_db_session.execute(
        text("insert into app_users (id, organization_id, full_name, email, status) values ('user_unauth_pa5', 'org_pa5', 'Unauth User', 'unauth@example.com', 'active')")
    )
    # Give role without order.confirm_payment
    await canonical_db_session.execute(text("insert into roles (id, key, name) values ('role_viewer', 'viewer', 'Viewer')"))
    await canonical_db_session.execute(text("insert into user_roles (user_id, role_id) values ('user_unauth_pa5', 'role_viewer')"))

    await canonical_db_session.execute(
        text("insert into customer_orders (id, order_number, organization_id, created_by, payment_intent) values ('ord_pa5', 'PTW-PA5', 'org_pa5', 'user_unauth_pa5', 'deposit_cod')")
    )
    await canonical_db_session.execute(
        text("insert into quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at) values ('qv_pa5', 'ord_pa5', 1, 'accepted', 1000, 1000, 300, 700, '2030-01-01')")
    )
    await canonical_db_session.execute(
        text("insert into payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at) values ('pr_pa5', 'ord_pa5', 'qv_pa5', 'deposit', 300, 'REF-PA5', 'qr', 'active', '2030-01-01')")
    )
    await canonical_db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await vietqr_webhook(
            payload={"reference": "REF-PA5", "amount": 300},
            x_webhook_secret="secret-pactor",
            db=canonical_db_session,
        )
    assert exc.value.status_code == 503
    assert "PAYMENT_SYSTEM_ACTOR_FORBIDDEN" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_p_actor_6_valid_actor_succeeds_and_attributes_audit(canonical_db_session, monkeypatch):
    """P-ACTOR-6: Configured active actor with permission succeeds and is recorded in audit."""
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "secret-pactor")
    monkeypatch.setenv("PAYMENT_SYSTEM_ACTOR_ID", "user_valid_pa6")

    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_pa6', 'Org PA6')"))
    await canonical_db_session.execute(
        text("insert into app_users (id, organization_id, full_name, email, status) values ('user_valid_pa6', 'org_pa6', 'System Payment Actor', 'syspay@example.com', 'active')")
    )
    sa_role = (await canonical_db_session.execute(text("select id from roles where key = 'super_admin'"))).scalar()
    await canonical_db_session.execute(text("insert into user_roles (user_id, role_id) values ('user_valid_pa6', :role_id)"), {"role_id": sa_role})

    await canonical_db_session.execute(
        text("insert into customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_status, payment_intent, current_quote_version, updated_at) values ('ord_pa6', 'PTW-PA6', 'org_pa6', 'user_valid_pa6', 'customer_accepted', 'deposit_requested', 'deposit_cod', 1, '2026-08-18 10:00:00')")
    )
    await canonical_db_session.execute(
        text("insert into quote_versions (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at) values ('qv_pa6', 'ord_pa6', 1, 'accepted', 1000, 1000, 300, 700, '2030-01-01')")
    )
    await canonical_db_session.execute(
        text("insert into payment_requests (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at) values ('pr_pa6', 'ord_pa6', 'qv_pa6', 'deposit', 300, 'REF-PA6', 'qr', 'active', '2030-01-01')")
    )
    await canonical_db_session.execute(
        text("""insert into payment_proofs
            (id, payment_request_id, storage_key, file_name, content_type,
             file_size_bytes, status, uploaded_by)
            values ('proof_pa6', 'pr_pa6', 'orders/ord_pa6/payment-proof/proof.jpg',
                    'proof.jpg', 'image/jpeg', 128, 'pending_admin_confirmation', 'user_valid_pa6')""")
    )
    await canonical_db_session.commit()

    res = await vietqr_webhook(
        payload={"reference": "REF-PA6", "amount": 300},
        x_webhook_secret="secret-pactor",
        db=canonical_db_session,
    )
    assert res["status"] == "success"

    # Verify audit attribution in order_revision_history
    audit_actor = (
        await canonical_db_session.execute(
            text("select actor_id, actor_name from order_revision_history where order_id = 'ord_pa6' order by revision_no desc limit 1")
        )
    ).mappings().first()
    assert audit_actor["actor_id"] == "user_valid_pa6"
    assert audit_actor["actor_name"] == "System Payment Actor"
    proof_status = (
        await canonical_db_session.execute(text("select status from payment_proofs where id = 'proof_pa6'"))
    ).scalar_one()
    assert proof_status == "accepted"


@pytest.mark.asyncio
async def test_vietqr_full_payment_locks_commercial_order(canonical_db_session, monkeypatch):
    monkeypatch.setenv("VIETQR_WEBHOOK_SECRET", "secret-full-lock")
    monkeypatch.setenv("PAYMENT_SYSTEM_ACTOR_ID", "user_full_lock")
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_full_lock', 'Org Full Lock')"))
    await canonical_db_session.execute(text("""insert into app_users
        (id, organization_id, full_name, email, status)
        values ('user_full_lock', 'org_full_lock', 'Full Payment Actor', 'full-lock@example.com', 'active')"""))
    role_id = (await canonical_db_session.execute(text("select id from roles where key = 'super_admin'"))).scalar_one()
    await canonical_db_session.execute(
        text("insert into user_roles (user_id, role_id) values ('user_full_lock', :role_id)"),
        {"role_id": role_id},
    )
    await canonical_db_session.execute(text("""insert into customer_orders
        (id, order_number, organization_id, created_by, commercial_status, payment_status,
         payment_intent, current_quote_version, updated_at)
        values ('ord_full_lock', 'PTW-FULL-LOCK', 'org_full_lock', 'user_full_lock',
                'customer_accepted', 'full_requested', 'pay_full', 1, '2026-08-18 10:00:00')"""))
    await canonical_db_session.execute(text("""insert into quote_versions
        (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
        values ('qv_full_lock', 'ord_full_lock', 1, 'accepted', 1000, 1000, 1000, 0, '2030-01-01')"""))
    await canonical_db_session.execute(text("""insert into payment_requests
        (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
        values ('pr_full_lock', 'ord_full_lock', 'qv_full_lock', 'full', 1000,
                'REF-FULL-LOCK', 'qr', 'active', '2030-01-01')"""))
    await canonical_db_session.commit()

    await vietqr_webhook(
        payload={"reference": "REF-FULL-LOCK", "amount": 1000},
        x_webhook_secret="secret-full-lock",
        db=canonical_db_session,
    )
    state = (await canonical_db_session.execute(text("""
        select payment_status, commercial_status from customer_orders where id = 'ord_full_lock'
    """))).mappings().one()
    assert state["payment_status"] == "paid"
    assert state["commercial_status"] == "locked"


# ── CUSTOMER OVERPOSTING & DEFENSE TESTS ──

@pytest.mark.asyncio
async def test_customer_overposting_items_rejected(canonical_db_session):
    """Customer update attempting to send items -> rejected."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_op1', 'Org OP1')"))
    await canonical_db_session.execute(
        text("insert into app_users (id, organization_id, full_name, email, status) values ('cust_op1', 'org_op1', 'Cust OP1', 'op1@example.com', 'active')")
    )
    await canonical_db_session.execute(
        text("insert into customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, updated_at) values ('ord_op1', 'PTW-OP1', 'org_op1', 'cust_op1', 'submitted', 'deposit_cod', '2026-08-18 10:00:00')")
    )
    await canonical_db_session.commit()

    with pytest.raises(ValueError, match="CUSTOMER_ITEM_MUTATION_FORBIDDEN"):
        await save_order(
            canonical_db_session,
            actor_id="cust_op1",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_op1",
                "items": [{"variantSku": "SKU-HACK", "quantity": 100}],
            },
        )


@pytest.mark.asyncio
async def test_customer_overposting_quote_versions_rejected(canonical_db_session):
    """Customer update attempting to send quoteVersions -> rejected."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_op2', 'Org OP2')"))
    await canonical_db_session.execute(
        text("insert into app_users (id, organization_id, full_name, email, status) values ('cust_op2', 'org_op2', 'Cust OP2', 'op2@example.com', 'active')")
    )
    await canonical_db_session.execute(
        text("insert into customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, updated_at) values ('ord_op2', 'PTW-OP2', 'org_op2', 'cust_op2', 'quoted', 'deposit_cod', '2026-08-18 10:00:00')")
    )
    await canonical_db_session.commit()

    with pytest.raises(ValueError, match="CUSTOMER_QUOTE_MUTATION_FORBIDDEN"):
        await save_order(
            canonical_db_session,
            actor_id="cust_op2",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_op2",
                "quoteVersions": [{"version": 1, "finalTotal": 100}],
            },
        )


@pytest.mark.asyncio
async def test_customer_overposting_payment_status_rejected(canonical_db_session):
    """Customer update attempting to self-set paymentStatus='paid' -> rejected."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_op3', 'Org OP3')"))
    await canonical_db_session.execute(
        text("insert into app_users (id, organization_id, full_name, email, status) values ('cust_op3', 'org_op3', 'Cust OP3', 'op3@example.com', 'active')")
    )
    await canonical_db_session.execute(
        text("insert into customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, updated_at) values ('ord_op3', 'PTW-OP3', 'org_op3', 'cust_op3', 'customer_accepted', 'deposit_cod', '2026-08-18 10:00:00')")
    )
    await canonical_db_session.commit()

    with pytest.raises(ValueError, match="CUSTOMER_PAYMENT_STATUS_MUTATION_FORBIDDEN"):
        await save_order(
            canonical_db_session,
            actor_id="cust_op3",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_op3",
                "paymentStatus": "paid",
            },
        )


# ── STATE CANCELATION SAFETY TESTS ──

@pytest.mark.asyncio
async def test_locked_order_cancellation_denied(canonical_db_session):
    """Locked order cancellation denied with LOCKED_ORDER_CANCELLATION_REQUIRES_REVERSAL_WORKFLOW."""
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_lc1', 'Org LC1')"))
    await canonical_db_session.execute(
        text("insert into app_users (id, organization_id, full_name, email, status) values ('admin_lc1', 'org_lc1', 'Admin LC1', 'lc1@example.com', 'active')")
    )
    sa_role = (await canonical_db_session.execute(text("select id from roles where key = 'super_admin'"))).scalar()
    await canonical_db_session.execute(text("insert into user_roles (user_id, role_id) values ('admin_lc1', :role_id)"), {"role_id": sa_role})

    await canonical_db_session.execute(
        text("insert into customer_orders (id, order_number, organization_id, created_by, commercial_status, payment_intent, updated_at) values ('ord_lc1', 'PTW-LC1', 'org_lc1', 'admin_lc1', 'locked', 'deposit_cod', '2026-08-18 10:00:00')")
    )
    await canonical_db_session.commit()

    with pytest.raises(ValueError, match="LOCKED_ORDER_CANCELLATION_REQUIRES_REVERSAL_WORKFLOW"):
        await save_order(
            canonical_db_session,
            actor_id="admin_lc1",
            expected_updated_at="2026-08-18T10:00:00",
            order={
                "id": "ord_lc1",
                "commercialStatus": "cancelled",
            },
        )
