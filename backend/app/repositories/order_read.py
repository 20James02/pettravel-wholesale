from __future__ import annotations

from collections import defaultdict
import hashlib
import time
from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_orders_cache: dict[tuple[str, bool], tuple[float, list[dict[str, Any]]]] = {}
_order_detail_cache: dict[str, tuple[float, dict[str, Any]]] = {}
ORDERS_CACHE_TTL = 15.0  # 15 seconds
ORDER_DETAIL_CACHE_TTL = 30.0  # 30 seconds


def invalidate_orders_cache(order_id: str | None = None) -> None:
    _orders_cache.clear()
    if order_id and order_id in _order_detail_cache:
        del _order_detail_cache[order_id]
    elif not order_id:
        _order_detail_cache.clear()


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _bound_in(column: str, values: Iterable[str], prefix: str) -> tuple[str, dict[str, str]]:
    params = {f"{prefix}_{index}": value for index, value in enumerate(values)}
    placeholders = ", ".join(f":{key}" for key in params)
    return f"{column} in ({placeholders})", params


def _group(rows: Iterable[Any], key: str) -> dict[str, list[Any]]:
    grouped: dict[str, list[Any]] = defaultdict(list)
    for row in rows:
        grouped[str(row[key])].append(row)
    return grouped


async def get_orders_revision(db: AsyncSession, *, actor_id: str, is_admin: bool) -> str:
    result = await db.execute(
        text("""
            select o.id, o.updated_at
            from customer_orders o
            where (:is_admin = true or o.organization_id = (
                select organization_id from app_users where id = :actor_id and status = 'active'
            ))
            order by o.updated_at desc, o.id desc
            limit 50
        """),
        {"actor_id": actor_id, "is_admin": is_admin},
    )
    rows = result.mappings().all()
    if not rows:
        return "empty"
    rev_string = "|".join(f"{r['id']}:{_iso(r['updated_at'])}" for r in rows)
    return hashlib.md5(rev_string.encode("utf-8")).hexdigest()


async def list_orders(db: AsyncSession, *, actor_id: str, is_admin: bool) -> list[dict[str, Any]]:
    now = time.monotonic()
    cache_key = (actor_id, is_admin)
    if cache_key in _orders_cache:
        cached_time, cached_data = _orders_cache[cache_key]
        if now - cached_time < ORDERS_CACHE_TTL:
            return cached_data
    order_rows = (
        await db.execute(
            text("""select
                o.*, creator.full_name as customer_name, org.name as customer_company,
                staff.full_name as assigned_staff_name
            from customer_orders o
            join app_users creator on creator.id = o.created_by
            join organizations org on org.id = o.organization_id
            left join app_users staff on staff.id = o.assigned_staff_id
            where (:is_admin = true or o.organization_id = (
                select organization_id from app_users where id = :actor_id and status = 'active'
            ))
            order by o.created_at desc, o.id"""),
            {"actor_id": actor_id, "is_admin": is_admin},
        )
    ).mappings().all()
    if not order_rows:
        return []

    order_ids = [str(row["id"]) for row in order_rows]
    order_filter, order_params = _bound_in("order_id", order_ids, "order")

    items = (
        await db.execute(text(f"select * from order_items where {order_filter} order by order_id, id"), order_params)
    ).mappings().all()
    quotes = (
        await db.execute(text(f"select * from quote_versions where {order_filter} order by order_id, version"), order_params)
    ).mappings().all()
    requests = (
        await db.execute(text(f"select * from payment_requests where {order_filter} order by order_id, expires_at, id"), order_params)
    ).mappings().all()
    comments = (
        await db.execute(
            text(f"""select c.*, u.full_name as author
                from order_comments c join app_users u on u.id = c.author_id
                where {order_filter.replace('order_id', 'c.order_id')}
                order by c.order_id, c.created_at"""),
            order_params,
        )
    ).mappings().all()
    groups = (
        await db.execute(
            text(f"""select fg.*, s.name as supplier_name
                from fulfillment_groups fg join suppliers s on s.id = fg.supplier_id
                where {order_filter.replace('order_id', 'fg.order_id')}
                order by fg.order_id, fg.id"""),
            order_params,
        )
    ).mappings().all()
    shipments = (
        await db.execute(
            text(f"""select * from shipments where {order_filter}
                order by order_id, created_at desc, id desc"""),
            order_params,
        )
    ).mappings().all()

    quote_ids = [str(row["id"]) for row in quotes]
    if quote_ids:
        quote_filter, quote_params = _bound_in("quote_id", quote_ids, "quote")
        adjustments = (
            await db.execute(
                text(f"select * from quote_adjustments where {quote_filter} order by quote_id, id"),
                quote_params,
            )
        ).mappings().all()
    else:
        adjustments = []

    request_ids = [str(row["id"]) for row in requests]
    if request_ids:
        request_filter, request_params = _bound_in("payment_request_id", request_ids, "request")
        proofs = (
            await db.execute(
                text(f"select * from payment_proofs where {request_filter} order by payment_request_id, uploaded_at"),
                request_params,
            )
        ).mappings().all()
    else:
        proofs = []

    group_ids = [str(row["id"]) for row in groups]
    if group_ids:
        group_filter, group_params = _bound_in("fulfillment_group_id", group_ids, "group")
        fulfillment_items = (
            await db.execute(
                text(f"select * from fulfillment_items where {group_filter} order by fulfillment_group_id, order_item_id"),
                group_params,
            )
        ).mappings().all()
    else:
        fulfillment_items = []

    items_by_order = _group(items, "order_id")
    quotes_by_order = _group(quotes, "order_id")
    adjustments_by_quote = _group(adjustments, "quote_id")
    requests_by_order = _group(requests, "order_id")
    proofs_by_request = _group(proofs, "payment_request_id")
    comments_by_order = _group(comments, "order_id")
    groups_by_order = _group(groups, "order_id")
    items_by_group = _group(fulfillment_items, "fulfillment_group_id")
    shipment_by_order: dict[str, Any] = {}
    for shipment in shipments:
        shipment_by_order.setdefault(str(shipment["order_id"]), shipment)

    output: list[dict[str, Any]] = []
    for order_row in order_rows:
        order_id = str(order_row["id"])
        order_quotes = quotes_by_order.get(order_id, [])
        quote_versions = {str(quote["id"]): int(quote["version"]) for quote in order_quotes}
        payment_requests: list[dict[str, Any]] = []
        payment_proofs: list[dict[str, Any]] = []
        for request in requests_by_order.get(order_id, []):
            request_proofs = [
                {
                    "id": proof["id"],
                    "paymentRequestId": proof["payment_request_id"],
                    "storageKey": proof["storage_key"],
                    "fileName": proof["file_name"],
                    "contentType": proof["content_type"],
                    "fileSizeBytes": int(proof["file_size_bytes"]),
                    "uploadedAt": _iso(proof["uploaded_at"]),
                    "status": proof["status"],
                }
                for proof in proofs_by_request.get(str(request["id"]), [])
            ]
            payment_proofs.extend(request_proofs)
            payment_requests.append(
                {
                    "id": request["id"],
                    "quoteVersion": quote_versions.get(str(request["quote_id"]), 0),
                    "purpose": request["purpose"],
                    "amount": int(request["amount"] or 0),
                    "reference": request["reference"],
                    "qrPayload": request["qr_payload"],
                    "status": request["status"],
                    "expiresAt": _iso(request["expires_at"]),
                }
            )

        shipment = shipment_by_order.get(order_id)
        output.append(
            {
                "id": order_id,
                "number": order_row["order_number"],
                "customerName": order_row["customer_name"],
                "customerCompany": order_row["customer_company"],
                "customerId": order_row["created_by"],
                "assignedStaffId": order_row["assigned_staff_id"],
                "assignedStaffName": order_row["assigned_staff_name"],
                "commercialStatus": order_row["commercial_status"],
                "paymentStatus": order_row["payment_status"],
                "fulfillmentStatus": order_row["fulfillment_status"],
                "paymentIntent": order_row["payment_intent"],
                "invoiceRequested": bool(order_row["invoice_requested"]),
                "createdAt": _iso(order_row["created_at"]),
                "updatedAt": _iso(order_row["updated_at"]),
                "recipientName": order_row["recipient_name"],
                "recipientPhone": order_row["recipient_phone"],
                "recipientAddress": order_row["recipient_address"],
                "items": [
                    {
                        "id": item["id"],
                        "productCode": item["product_code_snapshot"],
                        "productName": item["product_name_snapshot"],
                        "variantSku": item["variant_sku_snapshot"],
                        "variantLabel": item["variant_label_snapshot"],
                        "quantity": int(item["quantity"]),
                        "unitPriceSnapshot": int(item["unit_price_snapshot"]),
                        "supplierId": item["supplier_id"],
                    }
                    for item in items_by_order.get(order_id, [])
                ],
                "quoteVersions": [
                    {
                        "id": quote["id"],
                        "version": int(quote["version"]),
                        "status": quote["status"],
                        "subtotal": int(quote["subtotal"] or 0),
                        "finalTotal": int(quote["final_total"] or 0),
                        "depositAmount": int(quote["deposit_amount"] or 0),
                        "codRemaining": int(quote["cod_remaining"] or 0),
                        "shippingFeeOption": "included",
                        "expiresAt": _iso(quote["expires_at"]),
                        "adjustments": [
                            {
                                "id": adjustment["id"],
                                "type": adjustment["type"],
                                "label": adjustment["label"],
                                "amount": int(adjustment["amount"] or 0),
                                "requiresApproval": bool(adjustment["requires_approval"]),
                                "approvedBy": adjustment["approved_by"],
                            }
                            for adjustment in adjustments_by_quote.get(str(quote["id"]), [])
                        ],
                    }
                    for quote in order_quotes
                ],
                "paymentRequests": payment_requests,
                "paymentProofs": payment_proofs,
                "fulfillmentGroups": [
                    {
                        "id": group["id"],
                        "supplierId": group["supplier_id"],
                        "supplierName": group["supplier_name"],
                        "status": group["status"],
                        "itemIds": [
                            str(item["order_item_id"])
                            for item in items_by_group.get(str(group["id"]), [])
                        ],
                        "internalNote": group["internal_note"] or "",
                    }
                    for group in groups_by_order.get(order_id, [])
                ],
                "shipment": (
                    {
                        "carrier": shipment["carrier"],
                        "trackingCode": shipment["tracking_code"],
                        "shippingFee": int(shipment["shipping_fee"] or 0),
                        "eta": _iso(shipment["eta"]) or "",
                        "note": shipment["note"] or "",
                    }
                    if shipment
                    else None
                ),
                "comments": [
                    {
                        "id": comment["id"],
                        "author": comment["author"],
                        "audience": comment["audience"],
                        "message": comment["message"],
                        "createdAt": _iso(comment["created_at"]),
                    }
                    for comment in comments_by_order.get(order_id, [])
                ],
            }
        )
    _orders_cache[cache_key] = (now, output)
    return output
