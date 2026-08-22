from __future__ import annotations

from datetime import date
from typing import Any
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


ACCOUNTING_DOCUMENT_TYPES = {"purchase_receipt", "sales_invoice", "expense"}


async def post_operations_accounting(
    db: AsyncSession,
    *,
    document_id: str,
    document_no: str,
    document_type: str,
    organization_id: str,
    actor_id: str,
    total_amount_vnd: int,
    cogs_amount_vnd: int = 0,
    supplier_id: str | None = None,
) -> dict[str, Any]:
    """Post the accounting consequence of an operations document atomically."""
    if document_type not in ACCOUNTING_DOCUMENT_TYPES:
        return {"status": "not_required", "entryId": None}
    if db.get_bind().dialect.name != "postgresql":
        return {"status": "not_supported", "entryId": None}
    if total_amount_vnd < 0:
        raise ValueError("OPERATIONS_ACCOUNTING_AMOUNT_INVALID: Giá trị ghi sổ không được âm.")
    if total_amount_vnd == 0:
        return {"status": "not_required_zero_value", "entryId": None}

    idempotency_key = f"operations:{document_id}"
    existing = (
        await db.execute(
            text("SELECT id, status FROM journal_entries WHERE idempotency_key = :key FOR UPDATE"),
            {"key": idempotency_key},
        )
    ).mappings().first()
    if existing:
        return {"status": str(existing["status"]), "entryId": str(existing["id"]), "idempotent": True}

    period_id = (
        await db.execute(
            text("SELECT pt_ensure_accounting_period(:org_id, :posting_date)"),
            {"org_id": organization_id, "posting_date": date.today()},
        )
    ).scalar_one()
    accounting_document_id = f"adoc_{uuid.uuid4().hex}"
    entry_id = f"je_{uuid.uuid4().hex}"
    accounting_document_no = f"OPS-{document_no}"
    entry_no = f"JE-{accounting_document_no}"

    await db.execute(
        text("""INSERT INTO accounting_documents
            (id, organization_id, source_type, source_id, document_no, document_date,
             status, total_amount, created_by)
            VALUES (:id, :org_id, 'operations_document', :source_id, :document_no,
                    :document_date, 'draft', :total_amount, :actor_id)"""),
        {
            "id": accounting_document_id,
            "org_id": organization_id,
            "source_id": document_id,
            "document_no": accounting_document_no,
            "document_date": date.today(),
            "total_amount": total_amount_vnd,
            "actor_id": actor_id,
        },
    )
    await db.execute(
        text("""INSERT INTO journal_entries
            (id, organization_id, period_id, document_id, source_type, source_id,
             entry_no, description, status, idempotency_key, created_by)
            VALUES (:id, :org_id, :period_id, :document_id, 'operations_document', :source_id,
                    :entry_no, :description, 'draft', :idempotency_key, :actor_id)"""),
        {
            "id": entry_id,
            "org_id": organization_id,
            "period_id": period_id,
            "document_id": accounting_document_id,
            "source_id": document_id,
            "entry_no": entry_no,
            "description": f"Post operations document {document_no}",
            "idempotency_key": idempotency_key,
            "actor_id": actor_id,
        },
    )

    if document_type == "purchase_receipt":
        line_specs = [
            ("156", "Hàng hóa", total_amount_vnd, 0, supplier_id),
            ("331", "Phải trả cho người bán", 0, total_amount_vnd, supplier_id),
        ]
    elif document_type == "expense":
        line_specs = [
            ("642", "Chi phí quản lý doanh nghiệp", total_amount_vnd, 0, None),
            ("331", "Phải trả cho người bán", 0, total_amount_vnd, None),
        ]
    else:
        line_specs = [
            ("131", "Phải thu của khách hàng", total_amount_vnd, 0, None),
            ("5111", "Doanh thu bán hàng hóa", 0, total_amount_vnd, None),
        ]
        if cogs_amount_vnd > 0:
            line_specs.extend(
                [
                    ("632", "Giá vốn hàng bán", cogs_amount_vnd, 0, None),
                    ("156", "Hàng hóa", 0, cogs_amount_vnd, None),
                ]
            )

    for line_no, (account_code, account_name, debit, credit, line_supplier_id) in enumerate(line_specs, 1):
        await db.execute(
            text("""INSERT INTO journal_lines
                (id, entry_id, organization_id, line_no, account_code, account_name,
                 debit_amount, credit_amount, supplier_id, memo)
                VALUES (:id, :entry_id, :org_id, :line_no, :account_code, :account_name,
                        :debit, :credit, :supplier_id, :memo)"""),
            {
                "id": f"jl_{uuid.uuid4().hex}",
                "entry_id": entry_id,
                "org_id": organization_id,
                "line_no": line_no,
                "account_code": account_code,
                "account_name": account_name,
                "debit": debit,
                "credit": credit,
                "supplier_id": line_supplier_id,
                "memo": document_no,
            },
        )

    await db.execute(text("SELECT post_journal_entry(:entry_id, :actor_id)"), {"entry_id": entry_id, "actor_id": actor_id})
    await db.execute(
        text("UPDATE accounting_documents SET status = 'posted' WHERE id = :id"),
        {"id": accounting_document_id},
    )
    return {"status": "posted", "entryId": entry_id, "idempotent": False}
