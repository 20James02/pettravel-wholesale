-- Pet Travel WholeSale baseline schema for Supabase Postgres.
-- Apply in Supabase SQL Editor after reviewing table ownership and RLS policies.

create extension if not exists "pgcrypto";

create type user_status as enum ('invited', 'active', 'disabled');
create type quote_status as enum ('draft', 'published', 'accepted', 'superseded', 'expired');
create type payment_request_status as enum ('active', 'uploaded', 'confirmed', 'expired', 'superseded');
create type payment_purpose as enum ('deposit', 'full', 'remaining');
create type comment_audience as enum ('customer_visible', 'internal');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_code text,
  billing_email text,
  created_at timestamptz not null default now()
);

create table app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  full_name text not null,
  email text not null unique,
  status user_status not null default 'invited',
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  is_system boolean not null default false
);

create table permissions (
  key text primary key,
  description text not null
);

create table user_roles (
  user_id uuid not null references app_users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  lead_time_days integer not null default 1,
  admin_only boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  brand text not null,
  category text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text not null unique,
  label text not null,
  barcode text,
  active boolean not null default true
);

create table supplier_offers (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id),
  product_variant_id uuid not null references product_variants(id) on delete cascade,
  wholesale_price numeric(14, 0) not null check (wholesale_price >= 0),
  min_order_qty integer not null default 1 check (min_order_qty > 0),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  lead_time_days integer not null default 1,
  active boolean not null default true,
  unique (supplier_id, product_variant_id)
);

create table customer_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  organization_id uuid not null references organizations(id),
  created_by uuid not null references app_users(id),
  commercial_status text not null default 'submitted',
  payment_status text not null default 'unrequested',
  fulfillment_status text not null default 'not_started',
  payment_intent text not null check (payment_intent in ('deposit_cod', 'pay_full')),
  invoice_requested boolean not null default false,
  current_quote_version integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references customer_orders(id) on delete cascade,
  product_code_snapshot text not null,
  product_name_snapshot text not null,
  variant_sku_snapshot text not null,
  variant_label_snapshot text not null,
  supplier_id uuid not null references suppliers(id),
  quantity integer not null check (quantity > 0),
  unit_price_snapshot numeric(14, 0) not null check (unit_price_snapshot >= 0),
  locked boolean not null default false
);

create table quote_versions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references customer_orders(id) on delete cascade,
  version integer not null,
  status quote_status not null default 'draft',
  subtotal numeric(14, 0) not null default 0,
  final_total numeric(14, 0) not null default 0,
  deposit_amount numeric(14, 0) not null default 0,
  cod_remaining numeric(14, 0) not null default 0,
  expires_at timestamptz not null,
  published_by uuid references app_users(id),
  accepted_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (order_id, version)
);

create table quote_adjustments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quote_versions(id) on delete cascade,
  type text not null check (type in ('discount', 'free_shipping', 'offer', 'shipping_fee')),
  label text not null,
  amount numeric(14, 0) not null,
  requires_approval boolean not null default false,
  approved_by uuid references app_users(id)
);

create table fulfillment_groups (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references customer_orders(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  status text not null default 'supplier_checking',
  internal_note text,
  updated_at timestamptz not null default now(),
  unique (order_id, supplier_id)
);

create table fulfillment_items (
  fulfillment_group_id uuid not null references fulfillment_groups(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete cascade,
  primary key (fulfillment_group_id, order_item_id)
);

create table payment_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references customer_orders(id) on delete cascade,
  quote_id uuid not null references quote_versions(id),
  purpose payment_purpose not null,
  amount numeric(14, 0) not null check (amount > 0),
  reference text not null unique,
  qr_payload text not null,
  status payment_request_status not null default 'active',
  expires_at timestamptz not null,
  created_by uuid references app_users(id),
  confirmed_by uuid references app_users(id),
  confirmed_at timestamptz
);

create table payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_request_id uuid not null references payment_requests(id) on delete cascade,
  storage_key text not null,
  file_name text not null,
  content_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  status text not null default 'pending_admin_confirmation',
  uploaded_by uuid not null references app_users(id),
  uploaded_at timestamptz not null default now()
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references customer_orders(id) on delete cascade,
  carrier text not null,
  tracking_code text not null,
  shipping_fee numeric(14, 0) not null default 0,
  eta date,
  note text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table order_comments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references customer_orders(id) on delete cascade,
  author_id uuid not null references app_users(id),
  audience comment_audience not null,
  message text not null check (char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references app_users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references app_users(id),
  updated_at timestamptz not null default now()
);

create index idx_orders_org_updated on customer_orders (organization_id, updated_at desc);
create index idx_order_items_order on order_items (order_id);
create index idx_fulfillment_groups_order on fulfillment_groups (order_id);
create index idx_payment_requests_order_status on payment_requests (order_id, status);
create index idx_comments_order_created on order_comments (order_id, created_at desc);
create index idx_audit_entity on audit_log (entity_type, entity_id, created_at desc);

alter table organizations enable row level security;
alter table app_users enable row level security;
alter table customer_orders enable row level security;
alter table order_items enable row level security;
alter table order_comments enable row level security;
alter table payment_requests enable row level security;
alter table payment_proofs enable row level security;

-- Baseline policies. Production should add helper functions for permission checks.
create policy "users can read own profile"
  on app_users for select
  using (auth.uid() = auth_user_id);

create policy "customers can read own organization orders"
  on customer_orders for select
  using (
    exists (
      select 1
      from app_users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = customer_orders.organization_id
    )
  );

create policy "customers can read own order comments except internal"
  on order_comments for select
  using (
    audience = 'customer_visible'
    and exists (
      select 1
      from customer_orders o
      join app_users u on u.organization_id = o.organization_id
      where o.id = order_comments.order_id
        and u.auth_user_id = auth.uid()
    )
  );

insert into permissions (key, description) values
  ('catalog.read', 'Read products and variants'),
  ('catalog.write', 'Manage products and variants'),
  ('supplier.read', 'Read internal supplier data'),
  ('supplier.write', 'Manage suppliers and supplier offers'),
  ('order.read', 'Read orders'),
  ('order.quote', 'Publish quote versions'),
  ('order.adjust', 'Apply discounts, free shipping, and offers'),
  ('order.confirm_payment', 'Confirm money received'),
  ('order.ship', 'Attach shipment and tracking'),
  ('order.comment_internal', 'Write internal order notes'),
  ('rbac.write', 'Change roles and permissions')
on conflict (key) do nothing;

insert into roles (key, name, is_system) values
  ('super_admin', 'Super Admin', true),
  ('admin_manager', 'Admin Manager', true),
  ('order_operator', 'Order Operator', true),
  ('accountant', 'Accountant', true),
  ('warehouse', 'Warehouse', true),
  ('customer_owner', 'Customer Owner', true),
  ('customer_staff', 'Customer Staff', true)
on conflict (key) do nothing;

-- 🛡️ Security Triggers & Business Constraints

-- 1. Protect confirmed payments from modification (Financial Immutability)
CREATE OR REPLACE FUNCTION protect_confirmed_payments()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'confirmed' AND (
    NEW.status != 'confirmed' OR
    OLD.amount != NEW.amount OR
    OLD.order_id != NEW.order_id OR
    OLD.purpose != NEW.purpose OR
    OLD.quote_id != NEW.quote_id
  ) THEN
    RAISE EXCEPTION 'Khong the sua doi thong tin cua yeu cau thanh toan da xac nhan.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_confirmed_payments
BEFORE UPDATE ON payment_requests
FOR EACH ROW EXECUTE FUNCTION protect_confirmed_payments();

-- 2. Handle automatic quote and payment request superseding when a new quote is published
CREATE OR REPLACE FUNCTION on_quote_published()
RETURNS TRIGGER AS $$
BEGIN
  -- Mark older quote versions of the same order as superseded
  UPDATE quote_versions
  SET status = 'superseded'
  WHERE order_id = NEW.order_id
    AND id != NEW.id
    AND status IN ('draft', 'published');

  -- Mark active payment requests associated with superseded quote versions as superseded
  UPDATE payment_requests
  SET status = 'superseded'
  WHERE order_id = NEW.order_id
    AND quote_id IN (
      SELECT id FROM quote_versions 
      WHERE order_id = NEW.order_id AND id != NEW.id
    )
    AND status = 'active';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_on_quote_published
AFTER INSERT OR UPDATE ON quote_versions
FOR EACH ROW
WHEN (NEW.status = 'published')
EXECUTE FUNCTION on_quote_published();
