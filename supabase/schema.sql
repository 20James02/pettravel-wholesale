-- Pet Travel WholeSale baseline schema for Supabase Postgres.
-- Apply in Supabase SQL Editor after reviewing table ownership and RLS policies.

create extension if not exists "pgcrypto";

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid; $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end
$$;

create type user_status as enum ('invited', 'active', 'disabled');
create type quote_status as enum ('draft', 'published', 'accepted', 'superseded', 'expired');
create type payment_request_status as enum ('active', 'uploaded', 'confirmed', 'expired', 'superseded');
create type payment_purpose as enum ('deposit', 'full', 'remaining');
create type comment_audience as enum ('customer_visible', 'internal');

create table organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  tax_code text,
  billing_email text,
  created_at timestamptz not null default now()
);

create table app_users (
  id text primary key default gen_random_uuid()::text,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  organization_id text references organizations(id) on delete set null,
  full_name text not null,
  email text not null unique,
  phone text unique,
  avatar_url text,
  password_hash text,
  status user_status not null default 'invited',
  created_by text references app_users(id),
  created_at timestamptz not null default now()
);

create table roles (
  id text primary key default gen_random_uuid()::text,
  key text not null unique,
  name text not null,
  is_system boolean not null default false
);

create table permissions (
  key text primary key,
  description text not null
);

create table user_roles (
  user_id text not null references app_users(id) on delete cascade,
  role_id text not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create table role_permissions (
  role_id text not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

create table suppliers (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  lead_time_days integer not null default 1,
  admin_only boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table products (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  brand text not null,
  category text not null,
  description text,
  image_url text,
  images text[],
  dimensions text,
  weight numeric(10, 2),
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_variants (
  id text primary key default gen_random_uuid()::text,
  product_id text not null references products(id) on delete cascade,
  sku text not null unique,
  label text not null,
  barcode text,
  image_url text,
  active boolean not null default true
);

create table supplier_offers (
  id text primary key default gen_random_uuid()::text,
  supplier_id text not null references suppliers(id),
  product_variant_id text not null references product_variants(id) on delete cascade,
  wholesale_price numeric(14, 0) not null check (wholesale_price >= 0),
  min_order_qty integer not null default 1 check (min_order_qty > 0),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  lead_time_days integer not null default 1,
  active boolean not null default true,
  unique (supplier_id, product_variant_id)
);

create table customer_orders (
  id text primary key default gen_random_uuid()::text,
  order_number text not null unique,
  organization_id text not null references organizations(id),
  created_by text not null references app_users(id),
  commercial_status text not null default 'submitted',
  payment_status text not null default 'unrequested',
  fulfillment_status text not null default 'not_started',
  payment_intent text not null check (payment_intent in ('deposit_cod', 'pay_full')),
  invoice_requested boolean not null default false,
  current_quote_version integer not null default 0,
  recipient_name text,
  recipient_phone text,
  recipient_address text,
  customer_tax_code text,
  customer_note text,
  assigned_staff_id text references app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table order_items (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references customer_orders(id) on delete cascade,
  product_code_snapshot text not null,
  product_name_snapshot text not null,
  variant_sku_snapshot text not null,
  variant_label_snapshot text not null,
  variant_image text,
  supplier_id text not null references suppliers(id),
  quantity integer not null check (quantity > 0),
  unit_price_snapshot numeric(14, 0) not null check (unit_price_snapshot >= 0),
  locked boolean not null default false
);

create table quote_versions (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references customer_orders(id) on delete cascade,
  version integer not null,
  status quote_status not null default 'draft',
  subtotal numeric(14, 0) not null default 0,
  final_total numeric(14, 0) not null default 0,
  deposit_amount numeric(14, 0) not null default 0,
  cod_remaining numeric(14, 0) not null default 0,
  expires_at timestamptz not null,
  published_by text references app_users(id),
  accepted_by text references app_users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, version)
);

create table quote_adjustments (
  id text primary key default gen_random_uuid()::text,
  quote_id text not null references quote_versions(id) on delete cascade,
  type text not null check (type in ('discount', 'free_shipping', 'offer', 'shipping_fee')),
  label text not null,
  amount numeric(14, 0) not null,
  requires_approval boolean not null default false,
  approved_by text references app_users(id)
);

create table fulfillment_groups (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references customer_orders(id) on delete cascade,
  supplier_id text not null references suppliers(id),
  status text not null default 'supplier_checking',
  internal_note text,
  updated_at timestamptz not null default now(),
  unique (order_id, supplier_id)
);

create table fulfillment_items (
  fulfillment_group_id text not null references fulfillment_groups(id) on delete cascade,
  order_item_id text not null references order_items(id) on delete cascade,
  primary key (fulfillment_group_id, order_item_id)
);

create table payment_requests (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references customer_orders(id) on delete cascade,
  quote_id text not null references quote_versions(id),
  purpose payment_purpose not null,
  amount numeric(14, 0) not null check (amount > 0),
  reference text not null unique,
  qr_payload text not null,
  status payment_request_status not null default 'active',
  expires_at timestamptz not null,
  created_by text references app_users(id),
  confirmed_by text references app_users(id),
  confirmed_at timestamptz
);

create table payment_proofs (
  id text primary key default gen_random_uuid()::text,
  payment_request_id text not null references payment_requests(id) on delete cascade,
  storage_key text not null,
  file_name text not null,
  content_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  status text not null default 'pending_admin_confirmation',
  uploaded_by text not null references app_users(id),
  uploaded_at timestamptz not null default now()
);

create table shipments (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references customer_orders(id) on delete cascade,
  carrier text not null,
  tracking_code text not null,
  shipping_fee numeric(14, 0) not null default 0,
  eta date,
  note text,
  created_by text references app_users(id),
  created_at timestamptz not null default now()
);

create table order_comments (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references customer_orders(id) on delete cascade,
  author_id text not null references app_users(id),
  audience comment_audience not null,
  message text not null check (char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

create table order_revision_history (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references customer_orders(id) on delete cascade,
  revision_no integer not null,
  actor_id text not null references app_users(id),
  actor_name text not null,
  actor_role text not null,
  action_type text not null,
  from_commercial_status text not null,
  to_commercial_status text not null,
  items_snapshot jsonb not null default '[]'::jsonb,
  quote_snapshot jsonb not null default '[]'::jsonb,
  shipping_snapshot jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  constraint uq_order_revision unique (order_id, revision_no)
);

create table order_sync_revisions (
  scope_type text not null,
  scope_id text not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (scope_type, scope_id)
);

create unique index if not exists uq_customer_orders_active_org
  on customer_orders (organization_id)
  where commercial_status not in ('cancelled') and fulfillment_status not in ('delivered');

create index if not exists idx_order_revision_history_order_rev
  on order_revision_history (order_id, revision_no desc);

create index if not exists idx_customer_orders_org_updated
  on customer_orders (organization_id, updated_at desc, id desc);

create table audit_log (
  id text primary key default gen_random_uuid()::text,
  actor_id text references app_users(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by text references app_users(id),
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
alter table roles enable row level security;
alter table permissions enable row level security;
alter table user_roles enable row level security;
alter table role_permissions enable row level security;
alter table suppliers enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table supplier_offers enable row level security;
alter table customer_orders enable row level security;
alter table order_items enable row level security;
alter table quote_versions enable row level security;
alter table quote_adjustments enable row level security;
alter table fulfillment_groups enable row level security;
alter table fulfillment_items enable row level security;
alter table order_comments enable row level security;
alter table payment_requests enable row level security;
alter table payment_proofs enable row level security;
alter table shipments enable row level security;
alter table audit_log enable row level security;
alter table app_settings enable row level security;

create or replace function current_app_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id
  from app_users
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function current_app_user_org_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from app_users
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function current_app_user_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from app_users u
    join user_roles ur on ur.user_id = u.id
    join roles r on r.id = ur.role_id
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and r.key = any(allowed_roles)
  )
$$;

-- Defense-in-depth RLS for future direct Supabase Auth usage.
-- Current Next.js API uses SUPABASE_SERVICE_ROLE_KEY server-side; service role bypasses RLS.
create policy "users can read own profile"
  on app_users for select
  using (
    auth.uid() = auth_user_id
    or current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
  );

create policy "users can read own organization"
  on organizations for select
  using (
    id = current_app_user_org_id()
    or current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
  );

create policy "internal roles can read rbac"
  on roles for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager']));

create policy "internal roles can read permissions"
  on permissions for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager']));

create policy "internal roles can read user roles"
  on user_roles for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager']));

create policy "internal roles can read role permissions"
  on role_permissions for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager']));

create policy "internal roles can read suppliers"
  on suppliers for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'warehouse']));

create policy "internal roles can read catalog internals"
  on products for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'warehouse']));

create policy "internal roles can read product variants"
  on product_variants for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'warehouse']));

create policy "internal roles can read supplier offers"
  on supplier_offers for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'warehouse']));

create policy "customers can read own organization orders"
  on customer_orders for select
  using (
    current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
    or
    exists (
      select 1
      from app_users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = customer_orders.organization_id
    )
  );

create policy "customers can read own order items"
  on order_items for select
  using (
    current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
    or exists (
      select 1
      from customer_orders o
      where o.id = order_items.order_id
        and o.organization_id = current_app_user_org_id()
    )
  );

create policy "customers can read own quote versions"
  on quote_versions for select
  using (
    current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
    or exists (
      select 1
      from customer_orders o
      where o.id = quote_versions.order_id
        and o.organization_id = current_app_user_org_id()
    )
  );

create policy "customers can read own quote adjustments"
  on quote_adjustments for select
  using (
    current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
    or exists (
      select 1
      from quote_versions q
      join customer_orders o on o.id = q.order_id
      where q.id = quote_adjustments.quote_id
        and o.organization_id = current_app_user_org_id()
    )
  );

create policy "internal roles can read fulfillment groups"
  on fulfillment_groups for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'warehouse']));

create policy "internal roles can read fulfillment items"
  on fulfillment_items for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'warehouse']));

create policy "customers can read own order comments except internal"
  on order_comments for select
  using (
    current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
    or (
      audience = 'customer_visible'
      and exists (
        select 1
        from customer_orders o
        join app_users u on u.organization_id = o.organization_id
        where o.id = order_comments.order_id
          and u.auth_user_id = auth.uid()
      )
    )
  );

create policy "customers can read own payment requests"
  on payment_requests for select
  using (
    current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant'])
    or exists (
      select 1
      from customer_orders o
      where o.id = payment_requests.order_id
        and o.organization_id = current_app_user_org_id()
    )
  );

create policy "customers can read own payment proofs"
  on payment_proofs for select
  using (
    current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant'])
    or exists (
      select 1
      from payment_requests pr
      join customer_orders o on o.id = pr.order_id
      where pr.id = payment_proofs.payment_request_id
        and o.organization_id = current_app_user_org_id()
    )
  );

create policy "customers can read own shipments"
  on shipments for select
  using (
    current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'warehouse'])
    or exists (
      select 1
      from customer_orders o
      where o.id = shipments.order_id
        and o.organization_id = current_app_user_org_id()
    )
  );

create policy "internal roles can read audit log"
  on audit_log for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager']));

create policy "internal roles can read settings"
  on app_settings for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager']));

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

insert into role_permissions (role_id, permission_key)
select r.id, rp.permission_key
from roles r
join (
  values
    ('super_admin', 'catalog.read'),
    ('super_admin', 'catalog.write'),
    ('super_admin', 'supplier.read'),
    ('super_admin', 'supplier.write'),
    ('super_admin', 'order.read'),
    ('super_admin', 'order.quote'),
    ('super_admin', 'order.adjust'),
    ('super_admin', 'order.confirm_payment'),
    ('super_admin', 'order.ship'),
    ('super_admin', 'order.comment_internal'),
    ('super_admin', 'rbac.write'),
    ('admin_manager', 'catalog.read'),
    ('admin_manager', 'catalog.write'),
    ('admin_manager', 'supplier.read'),
    ('admin_manager', 'supplier.write'),
    ('admin_manager', 'order.read'),
    ('admin_manager', 'order.quote'),
    ('admin_manager', 'order.adjust'),
    ('admin_manager', 'order.confirm_payment'),
    ('admin_manager', 'order.ship'),
    ('admin_manager', 'order.comment_internal'),
    ('order_operator', 'catalog.read'),
    ('order_operator', 'supplier.read'),
    ('order_operator', 'order.read'),
    ('order_operator', 'order.quote'),
    ('order_operator', 'order.adjust'),
    ('order_operator', 'order.ship'),
    ('order_operator', 'order.comment_internal'),
    ('accountant', 'order.read'),
    ('accountant', 'order.confirm_payment'),
    ('accountant', 'order.comment_internal'),
    ('warehouse', 'catalog.read'),
    ('warehouse', 'supplier.read'),
    ('warehouse', 'order.read'),
    ('warehouse', 'order.ship'),
    ('warehouse', 'order.comment_internal'),
    ('customer_owner', 'catalog.read'),
    ('customer_owner', 'order.read'),
    ('customer_staff', 'catalog.read'),
    ('customer_staff', 'order.read')
) as rp(role_key, permission_key) on rp.role_key = r.key
on conflict (role_id, permission_key) do nothing;

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

-- Accounting core: double-entry, immutable posted entries, and internal-only RLS.

insert into permissions (key, description) values
  ('accounting.read', 'Read accounting periods, accounts, documents, and journal entries'),
  ('accounting.write', 'Create draft accounting documents and entries'),
  ('accounting.post', 'Post validated journal entries'),
  ('accounting.close_period', 'Close and lock accounting periods'),
  ('accounting.export', 'Export accounting reports and Google Sheet outputs')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_key)
select r.id, rp.permission_key
from roles r
join (
  values
    ('super_admin', 'accounting.read'),
    ('super_admin', 'accounting.write'),
    ('super_admin', 'accounting.post'),
    ('super_admin', 'accounting.close_period'),
    ('super_admin', 'accounting.export'),
    ('admin_manager', 'accounting.read'),
    ('admin_manager', 'accounting.write'),
    ('admin_manager', 'accounting.post'),
    ('admin_manager', 'accounting.close_period'),
    ('admin_manager', 'accounting.export'),
    ('accountant', 'accounting.read'),
    ('accountant', 'accounting.write'),
    ('accountant', 'accounting.post'),
    ('accountant', 'accounting.export')
) as rp(role_key, permission_key) on rp.role_key = r.key
on conflict (role_id, permission_key) do nothing;

create table if not exists accounting_periods (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  code text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by text references app_users(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  check (start_date <= end_date)
);

create table if not exists chart_of_accounts (
  id text primary key default gen_random_uuid()::text,
  organization_id text references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists accounting_documents (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  document_no text not null,
  document_date date not null,
  status text not null default 'draft' check (status in ('draft', 'posted', 'void')),
  total_amount numeric(14, 0) not null default 0 check (total_amount >= 0),
  currency text not null default 'VND' check (currency = 'VND'),
  created_by text references app_users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, document_no)
);

create table if not exists journal_entries (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  period_id text not null references accounting_periods(id),
  document_id text references accounting_documents(id),
  source_type text not null,
  source_id text not null,
  entry_no text not null,
  description text not null,
  status text not null default 'draft' check (status in ('draft', 'posted', 'void')),
  idempotency_key text not null unique,
  posted_by text references app_users(id),
  posted_at timestamptz,
  created_by text references app_users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, entry_no)
);

create table if not exists journal_lines (
  id text primary key default gen_random_uuid()::text,
  entry_id text not null references journal_entries(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  account_code text not null,
  account_name text not null,
  debit_amount numeric(14, 0) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(14, 0) not null default 0 check (credit_amount >= 0),
  partner_org_id text references organizations(id),
  order_id text references customer_orders(id),
  supplier_id text references suppliers(id),
  memo text,
  created_at timestamptz not null default now(),
  unique (entry_id, line_no),
  check (
    (debit_amount > 0 and credit_amount = 0)
    or
    (credit_amount > 0 and debit_amount = 0)
  )
);

create index if not exists idx_accounting_periods_org_dates on accounting_periods (organization_id, start_date, end_date);
create index if not exists idx_accounting_documents_source on accounting_documents (source_type, source_id);
create index if not exists idx_journal_entries_org_status on journal_entries (organization_id, status, created_at desc);
create index if not exists idx_journal_entries_source on journal_entries (source_type, source_id);
create index if not exists idx_journal_lines_entry on journal_lines (entry_id, line_no);
create index if not exists idx_journal_lines_account on journal_lines (organization_id, account_code);

alter table accounting_periods enable row level security;
alter table chart_of_accounts enable row level security;
alter table accounting_documents enable row level security;
alter table journal_entries enable row level security;
alter table journal_lines enable row level security;

create policy "internal accounting roles can read periods"
  on accounting_periods for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

create policy "internal accounting roles can read accounts"
  on chart_of_accounts for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

create policy "internal accounting roles can read documents"
  on accounting_documents for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

create policy "internal accounting roles can read journal entries"
  on journal_entries for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

create policy "internal accounting roles can read journal lines"
  on journal_lines for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

create or replace function assert_journal_entry_balanced(p_entry_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  debit_total numeric(14, 0);
  credit_total numeric(14, 0);
begin
  select
    coalesce(sum(debit_amount), 0),
    coalesce(sum(credit_amount), 0)
  into debit_total, credit_total
  from journal_lines
  where entry_id = p_entry_id;

  if debit_total <= 0 or debit_total <> credit_total then
    raise exception 'Journal entry is not balanced: debit %, credit %', debit_total, credit_total;
  end if;
end;
$$;

create or replace function post_journal_entry(p_entry_id text, p_actor_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  period_status text;
begin
  select ap.status
  into period_status
  from journal_entries je
  join accounting_periods ap on ap.id = je.period_id
  where je.id = p_entry_id;

  if period_status is null then
    raise exception 'Journal entry was not found.';
  end if;

  if period_status <> 'open' then
    raise exception 'Cannot post into a closed accounting period.';
  end if;

  perform assert_journal_entry_balanced(p_entry_id);

  update journal_entries
  set status = 'posted',
      posted_by = p_actor_id,
      posted_at = now()
  where id = p_entry_id
    and status = 'draft';

  if not found then
    raise exception 'Only draft journal entries can be posted.';
  end if;
end;
$$;

create or replace function protect_posted_journal_entry()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status = 'posted' then
    raise exception 'Cannot delete a posted journal entry.';
  end if;

  if tg_op = 'UPDATE' and old.status = 'posted' and new is distinct from old then
    raise exception 'Cannot modify a posted journal entry. Create a reversal entry instead.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_protect_posted_journal_entry
before update or delete on journal_entries
for each row execute function protect_posted_journal_entry();

create or replace function protect_posted_journal_lines()
returns trigger
language plpgsql
as $$
declare
  entry_status text;
begin
  select status into entry_status
  from journal_entries
  where id = coalesce(new.entry_id, old.entry_id);

  if entry_status = 'posted' then
    raise exception 'Cannot modify lines of a posted journal entry. Create a reversal entry instead.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_protect_posted_journal_lines
before update or delete on journal_lines
for each row execute function protect_posted_journal_lines();

-- Guard: Prevent mutation or deletion of accepted quote versions
-- Guard: Prevent mutation or deletion of accepted quote versions
create or replace function public.pt_guard_accepted_quote_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'accepted' then
      raise exception 'ACCEPTED_QUOTE_IMMUTABLE: Cannot delete an accepted quote version (id: %).', old.id;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'accepted' then
      if new is distinct from old then
        raise exception 'ACCEPTED_QUOTE_IMMUTABLE: Cannot modify commercial snapshot of accepted quote version (id: %).', old.id;
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_accepted_quote_immutability on public.quote_versions;
create trigger trg_guard_accepted_quote_immutability
before update or delete on public.quote_versions
for each row execute function public.pt_guard_accepted_quote_immutability();

-- Guard: Prevent mutation of adjustments belonging to accepted quotes
create or replace function public.pt_guard_accepted_adjustment_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_status text;
begin
  if tg_op = 'INSERT' then
    select status into v_quote_status from public.quote_versions where id = new.quote_id;
    if v_quote_status = 'accepted' then
      raise exception 'ACCEPTED_QUOTE_ADJUSTMENT_IMMUTABLE: Cannot add adjustments to an accepted quote version (quote_id: %).', new.quote_id;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select status into v_quote_status from public.quote_versions where id = old.quote_id;
    if v_quote_status = 'accepted' then
      raise exception 'ACCEPTED_QUOTE_ADJUSTMENT_IMMUTABLE: Cannot modify adjustments of an accepted quote version (quote_id: %).', old.quote_id;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select status into v_quote_status from public.quote_versions where id = old.quote_id;
    if v_quote_status = 'accepted' then
      raise exception 'ACCEPTED_QUOTE_ADJUSTMENT_IMMUTABLE: Cannot delete adjustments from an accepted quote version (quote_id: %).', old.quote_id;
    end if;
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_accepted_adjustment_immutability on public.quote_adjustments;
create trigger trg_guard_accepted_adjustment_immutability
before insert or update or delete on public.quote_adjustments
for each row execute function public.pt_guard_accepted_adjustment_immutability();

-- Guard: Prevent mutation of locked order items
create or replace function public.pt_guard_locked_order_item_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.locked = true then
      raise exception 'LOCKED_ITEM_IMMUTABLE: Cannot delete locked order item (id: %).', old.id;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.locked = true then
      if new.product_code_snapshot <> old.product_code_snapshot
         or new.product_name_snapshot <> old.product_name_snapshot
         or new.variant_sku_snapshot <> old.variant_sku_snapshot
         or new.variant_label_snapshot <> old.variant_label_snapshot
         or new.supplier_id <> old.supplier_id
         or new.quantity <> old.quantity
         or new.unit_price_snapshot <> old.unit_price_snapshot
         or new.order_id <> old.order_id then
        raise exception 'LOCKED_ITEM_IMMUTABLE: Cannot modify commercial fields of locked order item (id: %).', old.id;
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_locked_order_item_immutability on public.order_items;
create trigger trg_guard_locked_order_item_immutability
before update or delete on public.order_items
for each row execute function public.pt_guard_locked_order_item_immutability();

create unique index if not exists uq_quote_versions_single_accepted
on public.quote_versions (order_id)
where status = 'accepted';


