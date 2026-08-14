import pytest
from sqlalchemy import text

from app.repositories.order_read import list_orders
from app.repositories.orders import OrderConflictError, save_order


@pytest.mark.asyncio
async def test_customer_order_list_is_scoped_to_actor_organization(canonical_db_session):
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_1', 'Đại lý 1')"))
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_2', 'Đại lý 2')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('user_1', 'org_1', 'Chủ đại lý', 'owner@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, payment_intent)
            values ('order_1', 'PTW-1', 'org_1', 'user_1', 'deposit_cod')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, payment_intent)
            values ('order_other', 'PTW-2', 'org_2', 'user_1', 'deposit_cod')""")
    )
    await canonical_db_session.execute(
        text("""insert into order_items
            (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot,
             variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
            values ('item_1', 'order_1', 'PT-1', 'Túi', 'SKU-1', 'Xanh', 'sup_1', 2, 100000)""")
    )
    await canonical_db_session.commit()

    orders = await list_orders(canonical_db_session, actor_id="user_1", is_admin=False)

    assert [order["id"] for order in orders] == ["order_1"]
    assert orders[0]["customerCompany"] == "Đại lý 1"
    assert orders[0]["items"][0]["variantSku"] == "SKU-1"


@pytest.mark.asyncio
async def test_create_order_uses_server_catalog_snapshot_and_generated_number(canonical_db_session):
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_1', 'Đại lý 1')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('user_1', 'org_1', 'Chủ đại lý', 'owner@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into suppliers (id, code, name, active) values ('sup_1', 'SUP-1', 'NCC', 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into products (id, code, name, brand, category, active)
            values ('prod_1', 'PT-1', 'Túi chuẩn', 'Pet Travel', 'Túi', 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into product_variants (id, product_id, sku, label, active)
            values ('var_1', 'prod_1', 'SKU-1', 'Xanh', 1)""")
    )
    await canonical_db_session.execute(
        text("""insert into supplier_offers
            (id, supplier_id, product_variant_id, wholesale_price, min_order_qty, stock_qty, active)
            values ('offer_1', 'sup_1', 'var_1', 100000, 2, 20, 1)""")
    )
    await canonical_db_session.commit()

    result = await save_order(
        canonical_db_session,
        actor_id="user_1",
        order={
            "id": "order_new",
            "number": "CLIENT-CONTROLLED",
            "paymentIntent": "deposit_cod",
            "items": [{"variantSku": "SKU-1", "supplierId": "sup_1", "quantity": 2, "unitPriceSnapshot": 1}],
            "comments": [],
        },
    )

    assert result["orderNumber"].startswith("PTW-")
    orders = await list_orders(canonical_db_session, actor_id="user_1", is_admin=False)
    assert orders[0]["number"] != "CLIENT-CONTROLLED"
    assert orders[0]["items"][0]["unitPriceSnapshot"] == 100000


@pytest.mark.asyncio
async def test_customer_upload_persists_payment_proof_metadata(canonical_db_session):
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_1', 'Đại lý 1')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('user_1', 'org_1', 'Chủ đại lý', 'owner@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, payment_intent)
            values ('order_1', 'PTW-1', 'org_1', 'user_1', 'deposit_cod')""")
    )
    await canonical_db_session.execute(
        text("""insert into quote_versions
            (id, order_id, version, status, subtotal, final_total, deposit_amount, cod_remaining, expires_at)
            values ('quote_1', 'order_1', 1, 'published', 100000, 100000, 30000, 70000, '2030-01-01')""")
    )
    await canonical_db_session.execute(
        text("""insert into payment_requests
            (id, order_id, quote_id, purpose, amount, reference, qr_payload, status, expires_at)
            values ('request_1', 'order_1', 'quote_1', 'deposit', 30000, 'REF-1', 'QR', 'active', '2030-01-01')""")
    )
    await canonical_db_session.commit()

    await save_order(
        canonical_db_session,
        actor_id="user_1",
        order={
            "id": "order_1",
            "paymentRequests": [{"id": "request_1", "purpose": "deposit"}],
            "paymentProofs": [
                {
                    "id": "proof_1",
                    "paymentRequestId": "request_1",
                    "storageKey": "payment-proof/order_1/proof.jpg",
                    "fileName": "proof.jpg",
                    "contentType": "image/jpeg",
                    "fileSizeBytes": 1234,
                }
            ],
            "comments": [],
        },
    )

    proof = (
        await canonical_db_session.execute(text("select * from payment_proofs where id = 'proof_1'"))
    ).mappings().one()
    request = (
        await canonical_db_session.execute(text("select status from payment_requests where id = 'request_1'"))
    ).scalar_one()
    assert proof["storage_key"] == "payment-proof/order_1/proof.jpg"
    assert request == "uploaded"


@pytest.mark.asyncio
async def test_update_rejects_stale_order_version(canonical_db_session):
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_1', 'Đại lý 1')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('user_1', 'org_1', 'Chủ đại lý', 'owner@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, payment_intent, updated_at)
            values ('order_1', 'PTW-1', 'org_1', 'user_1', 'deposit_cod', '2026-08-15 00:00:00')""")
    )
    await canonical_db_session.commit()

    with pytest.raises(OrderConflictError):
        await save_order(
            canonical_db_session,
            actor_id="user_1",
            expected_updated_at="2026-08-14T00:00:00",
            order={
                "id": "order_1",
                "recipientName": "Người nhận mới",
            },
        )


@pytest.mark.asyncio
async def test_create_order_builds_fulfillment_groups_and_list_includes_shipment(canonical_db_session):
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_1', 'Đại lý 1')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('user_1', 'org_1', 'Chủ đại lý', 'owner@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("insert into suppliers (id, code, name, active) values ('sup_1', 'SUP-1', 'Nhà cung cấp', 1)")
    )
    await canonical_db_session.execute(
        text("""insert into products (id, code, name, brand, category, active)
            values ('prod_1', 'PT-1', 'Túi chuẩn', 'Pet Travel', 'Túi', 1)""")
    )
    await canonical_db_session.execute(
        text("insert into product_variants (id, product_id, sku, label, active) values ('var_1', 'prod_1', 'SKU-1', 'Xanh', 1)")
    )
    await canonical_db_session.execute(
        text("""insert into supplier_offers
            (id, supplier_id, product_variant_id, wholesale_price, min_order_qty, stock_qty, active)
            values ('offer_1', 'sup_1', 'var_1', 100000, 1, 20, 1)""")
    )
    await canonical_db_session.commit()

    await save_order(
        canonical_db_session,
        actor_id="user_1",
        order={
            "id": "order_new",
            "items": [{"id": "item_1", "variantSku": "SKU-1", "supplierId": "sup_1", "quantity": 2}],
        },
    )
    await canonical_db_session.execute(
        text("""insert into shipments
            (id, order_id, carrier, tracking_code, shipping_fee, eta, note, created_by)
            values ('ship_1', 'order_new', 'GHN', 'GHN-001', 25000, '2026-08-20', 'Đã giao', 'user_1')""")
    )
    await canonical_db_session.commit()

    orders = await list_orders(canonical_db_session, actor_id="user_1", is_admin=False)

    assert orders[0]["fulfillmentGroups"] == [
        {
            "id": orders[0]["fulfillmentGroups"][0]["id"],
            "supplierId": "sup_1",
            "supplierName": "Nhà cung cấp",
            "status": "supplier_checking",
            "itemIds": ["item_1"],
            "internalNote": "",
        }
    ]
    assert orders[0]["shipment"]["trackingCode"] == "GHN-001"


@pytest.mark.asyncio
async def test_backend_enforces_shipping_permission(canonical_db_session):
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_internal', 'Pet Travel')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('admin_1', 'org_internal', 'Nhân viên', 'admin@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("insert into user_roles (user_id, role_id) values ('admin_1', 'role_admin')")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, payment_intent, updated_at)
            values ('order_1', 'PTW-1', 'org_internal', 'admin_1', 'deposit_cod', '2026-08-15 00:00:00')""")
    )
    await canonical_db_session.commit()

    with pytest.raises(ValueError, match="order.ship"):
        await save_order(
            canonical_db_session,
            actor_id="admin_1",
            expected_updated_at="2026-08-15T00:00:00",
            order={"id": "order_1", "fulfillmentStatus": "shipped"},
        )


@pytest.mark.asyncio
async def test_shipping_update_persists_fulfillment_and_shipment(canonical_db_session):
    await canonical_db_session.execute(
        text("insert into organizations (id, name) values ('org_customer', 'Đại lý'), ('org_internal', 'Pet Travel')")
    )
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status) values
            ('customer_1', 'org_customer', 'Khách', 'customer@example.com', 'active'),
            ('admin_1', 'org_internal', 'Kho', 'warehouse@example.com', 'active')""")
    )
    await canonical_db_session.execute(text("insert into user_roles (user_id, role_id) values ('admin_1', 'role_admin')"))
    await canonical_db_session.execute(text("insert into permissions (key, description) values ('order.ship', 'Ship order')"))
    await canonical_db_session.execute(
        text("insert into role_permissions (role_id, permission_key) values ('role_admin', 'order.ship')")
    )
    await canonical_db_session.execute(
        text("insert into suppliers (id, code, name, active) values ('sup_1', 'SUP-1', 'Nhà cung cấp', 1)")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, payment_intent, fulfillment_status, updated_at)
            values ('order_1', 'PTW-1', 'org_customer', 'customer_1', 'deposit_cod', 'ready_to_ship', '2026-08-15 00:00:00')""")
    )
    await canonical_db_session.execute(
        text("""insert into order_items
            (id, order_id, product_code_snapshot, product_name_snapshot, variant_sku_snapshot,
             variant_label_snapshot, supplier_id, quantity, unit_price_snapshot)
            values ('item_1', 'order_1', 'PT-1', 'Túi', 'SKU-1', 'Xanh', 'sup_1', 2, 100000)""")
    )
    await canonical_db_session.execute(
        text("""insert into fulfillment_groups (id, order_id, supplier_id, status, internal_note, updated_at)
            values ('group_1', 'order_1', 'sup_1', 'supplier_confirmed', '', '2026-08-15 00:00:00')""")
    )
    await canonical_db_session.execute(
        text("insert into fulfillment_items (fulfillment_group_id, order_item_id) values ('group_1', 'item_1')")
    )
    await canonical_db_session.commit()

    await save_order(
        canonical_db_session,
        actor_id="admin_1",
        expected_updated_at="2026-08-15T00:00:00",
        order={
            "id": "order_1",
            "fulfillmentStatus": "shipped",
            "fulfillmentGroups": [
                {
                    "id": "group_1",
                    "supplierId": "sup_1",
                    "status": "shipped",
                    "internalNote": "Đã bàn giao",
                    "itemIds": ["item_1"],
                }
            ],
            "shipment": {
                "carrier": "GHN",
                "trackingCode": "GHN-001",
                "shippingFee": 25000,
                "eta": "2026-08-20",
                "note": "Đã giao",
            },
        },
    )

    orders = await list_orders(canonical_db_session, actor_id="admin_1", is_admin=True)
    assert orders[0]["fulfillmentGroups"][0]["status"] == "shipped"
    assert orders[0]["fulfillmentGroups"][0]["internalNote"] == "Đã bàn giao"
    assert orders[0]["shipment"]["trackingCode"] == "GHN-001"


@pytest.mark.asyncio
async def test_operator_cannot_publish_adjustment_requiring_manager_approval(canonical_db_session):
    await canonical_db_session.execute(text("insert into organizations (id, name) values ('org_internal', 'Pet Travel')"))
    await canonical_db_session.execute(
        text("""insert into app_users (id, organization_id, full_name, email, status)
            values ('operator_1', 'org_internal', 'Điều hành', 'operator@example.com', 'active')""")
    )
    await canonical_db_session.execute(
        text("insert into roles (id, key, name) values ('role_operator', 'order_operator', 'Order operator')")
    )
    await canonical_db_session.execute(text("insert into user_roles (user_id, role_id) values ('operator_1', 'role_operator')"))
    await canonical_db_session.execute(
        text("""insert into permissions (key, description) values
            ('order.quote', 'Quote'), ('order.adjust', 'Adjust')""")
    )
    await canonical_db_session.execute(
        text("""insert into role_permissions (role_id, permission_key) values
            ('role_operator', 'order.quote'), ('role_operator', 'order.adjust')""")
    )
    await canonical_db_session.execute(
        text("""insert into customer_orders
            (id, order_number, organization_id, created_by, payment_intent, updated_at)
            values ('order_1', 'PTW-1', 'org_internal', 'operator_1', 'deposit_cod', '2026-08-15 00:00:00')""")
    )
    await canonical_db_session.commit()

    with pytest.raises(ValueError, match="quản lý"):
        await save_order(
            canonical_db_session,
            actor_id="operator_1",
            expected_updated_at="2026-08-15T00:00:00",
            order={
                "id": "order_1",
                "commercialStatus": "quoted",
                "quoteVersions": [
                    {
                        "id": "quote_1",
                        "version": 1,
                        "status": "published",
                        "subtotal": 100000,
                        "finalTotal": 90000,
                        "depositAmount": 30000,
                        "codRemaining": 60000,
                        "expiresAt": "2030-01-01T00:00:00Z",
                        "adjustments": [
                            {
                                "id": "adjustment_1",
                                "type": "discount",
                                "label": "Chiết khấu đặc biệt",
                                "amount": -10000,
                                "requiresApproval": True,
                            }
                        ],
                    }
                ],
            },
        )
