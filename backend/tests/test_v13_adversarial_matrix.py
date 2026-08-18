from __future__ import annotations

import os
import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import text
from fastapi import HTTPException

from app.repositories.orders import OrderConflictError, save_order
from app.routers.v1.endpoints.orders import vietqr_webhook


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
            values ('pr_p6', 'ord_p6', 'qv_p6', 'deposit', 300000, 'REF-P6-EXPIRED', 'payload', 'expired', '2020-01-01 00:00:00')""")
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

    # Non-existent reference -> 404
    with pytest.raises(HTTPException) as exc_404:
        await vietqr_webhook(
            payload={"reference": "REF-DOES-NOT-EXIST", "amount": 300000},
            x_webhook_secret="secret-123",
            db=canonical_db_session,
        )
    assert exc_404.value.status_code == 404
