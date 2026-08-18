import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.wholesale import Base

# Dùng SQLite in-memory cho async unit tests cô lập
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture(scope="function")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        # Tạo tất cả các bảng trong memory database trước khi chạy test
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine) -> AsyncSession:
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
        await session.rollback()
        await session.close()


@pytest_asyncio.fixture(scope="function")
async def canonical_db_session() -> AsyncSession:
    """SQLite contract fixture that mirrors the canonical Supabase table names."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    ddl = [
        "create table organizations (id text primary key, name text not null)",
        """create table app_users (
            id text primary key,
            organization_id text,
            full_name text not null,
            email text not null unique,
            phone text unique,
            avatar_url text,
            password_hash text,
            status text not null default 'invited',
            created_at timestamp not null default current_timestamp
        )""",
        "create table roles (id text primary key, key text not null unique, name text not null)",
        "create table permissions (key text primary key, description text not null)",
        "create table user_roles (user_id text not null, role_id text not null, primary key (user_id, role_id))",
        "create table role_permissions (role_id text not null, permission_key text not null, primary key (role_id, permission_key))",
        """create table suppliers (
            id text primary key, code text not null unique, name text not null,
            lead_time_days integer not null default 1, admin_only boolean not null default 1,
            active boolean not null default 1
        )""",
        """create table products (
            id text primary key, code text not null unique, name text not null,
            brand text not null, category text not null, description text, image_url text,
            images text, dimensions text, weight numeric, tags text,
            active boolean not null default 1
        )""",
        """create table product_variants (
            id text primary key, product_id text not null, sku text not null unique,
            label text not null, barcode text, image_url text, active boolean not null default 1
        )""",
        """create table supplier_offers (
            id text primary key, supplier_id text not null, product_variant_id text not null,
            wholesale_price numeric not null, min_order_qty integer not null default 1,
            stock_qty integer not null default 0, lead_time_days integer not null default 1,
            active boolean not null default 1, unique (supplier_id, product_variant_id)
        )""",
        """create table customer_orders (
            id text primary key, order_number text not null unique, organization_id text not null,
            created_by text not null, commercial_status text not null default 'submitted',
            payment_status text not null default 'unrequested', fulfillment_status text not null default 'not_started',
            payment_intent text not null, invoice_requested boolean not null default 0,
            current_quote_version integer not null default 0, recipient_name text, recipient_phone text,
            recipient_address text, customer_tax_code text, customer_note text, assigned_staff_id text,
            updated_at timestamp not null default current_timestamp,
            created_at timestamp not null default current_timestamp
        )""",
        """create table order_items (
            id text primary key, order_id text not null, product_code_snapshot text not null,
            product_name_snapshot text not null, variant_sku_snapshot text not null,
            variant_label_snapshot text not null, variant_image text, supplier_id text not null, quantity integer not null,
            unit_price_snapshot numeric not null, locked boolean not null default 0
        )""",
        """create table quote_versions (
            id text primary key, order_id text not null, version integer not null, status text not null,
            subtotal numeric not null, final_total numeric not null, deposit_amount numeric not null,
            cod_remaining numeric not null, expires_at timestamp not null, published_by text,
            accepted_by text, accepted_at timestamp, created_at timestamp default current_timestamp
        )""",
        """create table quote_adjustments (
            id text primary key, quote_id text not null, type text not null, label text not null,
            amount numeric not null, requires_approval boolean not null default 0, approved_by text
        )""",
        """create table fulfillment_groups (
            id text primary key, order_id text not null, supplier_id text not null,
            status text not null default 'supplier_checking', internal_note text,
            updated_at timestamp not null default current_timestamp,
            unique (order_id, supplier_id)
        )""",
        """create table fulfillment_items (
            fulfillment_group_id text not null, order_item_id text not null,
            primary key (fulfillment_group_id, order_item_id)
        )""",
        """create table payment_requests (
            id text primary key, order_id text not null, quote_id text not null, purpose text not null,
            amount numeric not null, reference text not null unique, qr_payload text not null,
            status text not null, expires_at timestamp not null, confirmed_by text, confirmed_at timestamp
        )""",
        """create table payment_proofs (
            id text primary key, payment_request_id text not null, storage_key text not null,
            file_name text not null, content_type text not null, file_size_bytes integer not null,
            status text not null, uploaded_by text not null, uploaded_at timestamp default current_timestamp
        )""",
        """create table shipments (
            id text primary key, order_id text not null, carrier text not null,
            tracking_code text not null, shipping_fee numeric not null default 0,
            eta text, note text, created_by text, created_at timestamp default current_timestamp
        )""",
        """create table order_comments (
            id text primary key, order_id text not null, author_id text not null, audience text not null,
            message text not null, created_at timestamp default current_timestamp
        )""",
        """create table order_revision_history (
            id text primary key, order_id text not null, revision_no integer not null,
            actor_id text not null, actor_name text not null, actor_role text not null,
            action_type text not null, from_commercial_status text not null,
            to_commercial_status text not null, items_snapshot json default '[]',
            quote_snapshot json default '[]', shipping_snapshot json default '{}',
            note text, created_at timestamp default current_timestamp,
            unique (order_id, revision_no)
        )""",
        """create table order_sync_revisions (
            scope_type text not null, scope_id text not null,
            revision integer not null default 1, updated_at timestamp default current_timestamp,
            primary key (scope_type, scope_id)
        )""",
        """create table inventory_balances (
            id text primary key, organization_id text not null, warehouse_id text,
            product_variant_id text, sku text not null, supplier_id text,
            on_hand_qty integer not null default 0, reserved_qty integer not null default 0,
            defective_qty integer not null default 0, avg_cost_vnd numeric not null default 0
        )""",
        """create table stock_reservations (
            id text primary key, organization_id text not null, sku_snapshot text not null,
            quantity integer not null, status text not null, expires_at timestamp
        )""",
        """create table journal_entries (
            id text primary key, organization_id text not null, status text not null
        )""",
        """create table journal_lines (
            id text primary key, entry_id text not null, organization_id text not null,
            account_code text not null, account_name text not null,
            debit_amount numeric not null default 0, credit_amount numeric not null default 0
        )""",
        """create table receivable_ledger_entries (
            id text primary key, organization_id text not null, customer_org_id text,
            customer_name text not null, debit_amount numeric not null default 0,
            credit_amount numeric not null default 0, due_date text, status text not null
        )""",
        """create table payable_ledger_entries (
            id text primary key, organization_id text not null, supplier_id text,
            partner_name text not null, debit_amount numeric not null default 0,
            credit_amount numeric not null default 0, due_date text, status text not null
        )""",
        """create table reconciliation_batches (
            id text primary key, organization_id text not null, type text not null,
            status text not null, total_matched_amount numeric not null default 0,
            total_difference_amount numeric not null default 0
        )""",
        """create table bank_transactions (
            id text primary key, organization_id text not null, reconciliation_status text not null
        )""",
        """create table app_settings (
            key text primary key, value json not null, updated_by text, updated_at timestamp default current_timestamp
        )""",
        """create table audit_log (
            id text primary key, actor_id text, entity_type text not null, entity_id text not null,
            action text not null, before_data json, after_data json, reason text, created_at timestamp default current_timestamp
        )""",
    ]
    async with engine.begin() as conn:
        for statement in ddl:
            await conn.execute(text(statement))
        await conn.execute(
            text("insert into roles (id, key, name) values (:id, :key, :name)"),
            [
                {"id": "role_super_admin", "key": "super_admin", "name": "Super Admin"},
                {"id": "role_admin", "key": "admin", "name": "Admin"},
                {"id": "role_customer", "key": "customer_owner", "name": "Customer Owner"},
            ],
        )

    from app.repositories.catalog import invalidate_catalog_cache
    from app.repositories.order_read import invalidate_orders_cache
    from app.repositories.identity import invalidate_users_cache
    invalidate_catalog_cache()
    invalidate_orders_cache()
    invalidate_users_cache()

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()
    invalidate_catalog_cache()
    invalidate_orders_cache()
    invalidate_users_cache()
    await engine.dispose()
