-- Operations, purchasing, inventory, invoices, defects, and expenses for Pet Travel WholeSale.
-- Run after update_v3_accounting.sql.

insert into permissions (key, description) values
  ('operations.read', 'Read purchasing, warehouse, inventory, invoice, defect, and expense operations'),
  ('operations.write', 'Create and edit draft operations documents'),
  ('operations.post', 'Post operations documents and create immutable stock movements')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_key)
select r.id, rp.permission_key
from roles r
join (
  values
    ('super_admin', 'operations.read'),
    ('super_admin', 'operations.write'),
    ('super_admin', 'operations.post'),
    ('admin_manager', 'operations.read'),
    ('admin_manager', 'operations.write'),
    ('admin_manager', 'operations.post'),
    ('order_operator', 'operations.read'),
    ('order_operator', 'operations.write'),
    ('accountant', 'operations.read'),
    ('accountant', 'operations.write'),
    ('accountant', 'operations.post'),
    ('warehouse', 'operations.read'),
    ('warehouse', 'operations.write'),
    ('warehouse', 'operations.post')
) as rp(role_key, permission_key) on rp.role_key = r.key
on conflict (role_id, permission_key) do nothing;

create table if not exists warehouses (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists operations_documents (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  type text not null check (type in ('purchase_receipt', 'sales_invoice', 'expense', 'defect_report', 'stock_adjustment')),
  document_no text not null,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'posted', 'void')),
  partner_name text,
  total_amount numeric(14, 0) not null default 0 check (total_amount >= 0),
  currency text not null default 'VND' check (currency = 'VND'),
  note text,
  created_by text references app_users(id),
  posted_by text references app_users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, document_no)
);

create table if not exists operations_document_lines (
  id text primary key default gen_random_uuid()::text,
  document_id text not null references operations_documents(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  product_variant_id text references product_variants(id),
  sku_snapshot text not null,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(14, 0) not null default 0 check (unit_cost >= 0),
  total_cost numeric(14, 0) not null default 0 check (total_cost >= 0),
  supplier_id text references suppliers(id),
  created_at timestamptz not null default now(),
  unique (document_id, line_no)
);

create table if not exists inventory_balances (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  warehouse_id text not null references warehouses(id) on delete cascade,
  product_variant_id text references product_variants(id),
  sku text not null,
  supplier_id text references suppliers(id),
  on_hand_qty integer not null default 0 check (on_hand_qty >= 0),
  reserved_qty integer not null default 0 check (reserved_qty >= 0),
  defective_qty integer not null default 0 check (defective_qty >= 0),
  avg_cost_vnd numeric(14, 0) not null default 0 check (avg_cost_vnd >= 0),
  updated_at timestamptz not null default now(),
  unique (organization_id, warehouse_id, sku)
);

create table if not exists stock_movements (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  warehouse_id text not null references warehouses(id) on delete cascade,
  document_id text not null references operations_documents(id) on delete cascade,
  product_variant_id text references product_variants(id),
  sku_snapshot text not null,
  movement_type text not null check (movement_type in ('purchase_in', 'sale_out', 'adjustment', 'defect_in', 'defect_out', 'return_to_supplier')),
  quantity_delta integer not null default 0,
  defective_delta integer not null default 0,
  unit_cost numeric(14, 0) not null default 0 check (unit_cost >= 0),
  created_by text references app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists expense_documents (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  operations_document_id text not null unique references operations_documents(id) on delete cascade,
  expense_category text not null,
  amount numeric(14, 0) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists business_invoices (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  operations_document_id text not null unique references operations_documents(id) on delete cascade,
  invoice_no text not null,
  invoice_type text not null default 'sales' check (invoice_type in ('sales', 'purchase', 'vat')),
  status text not null default 'draft' check (status in ('draft', 'issued', 'void')),
  partner_name text,
  total_amount numeric(14, 0) not null default 0 check (total_amount >= 0),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, invoice_no)
);

create index if not exists idx_operations_documents_org_type_created on operations_documents (organization_id, type, created_at desc);
create index if not exists idx_operations_documents_status on operations_documents (organization_id, status);
create index if not exists idx_operations_lines_document on operations_document_lines (document_id, line_no);
create index if not exists idx_inventory_balances_org_sku on inventory_balances (organization_id, sku);
create index if not exists idx_stock_movements_doc on stock_movements (document_id, created_at desc);

alter table warehouses enable row level security;
alter table operations_documents enable row level security;
alter table operations_document_lines enable row level security;
alter table inventory_balances enable row level security;
alter table stock_movements enable row level security;
alter table expense_documents enable row level security;
alter table business_invoices enable row level security;

drop policy if exists "internal operations roles can read warehouses" on warehouses;
create policy "internal operations roles can read warehouses"
  on warehouses for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse']));

drop policy if exists "internal operations roles can read documents" on operations_documents;
create policy "internal operations roles can read documents"
  on operations_documents for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse']));

drop policy if exists "internal operations roles can read document lines" on operations_document_lines;
create policy "internal operations roles can read document lines"
  on operations_document_lines for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse']));

drop policy if exists "internal operations roles can read balances" on inventory_balances;
create policy "internal operations roles can read balances"
  on inventory_balances for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse']));

drop policy if exists "internal operations roles can read movements" on stock_movements;
create policy "internal operations roles can read movements"
  on stock_movements for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse']));

drop policy if exists "internal operations roles can read expenses" on expense_documents;
create policy "internal operations roles can read expenses"
  on expense_documents for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse']));

drop policy if exists "internal operations roles can read invoices" on business_invoices;
create policy "internal operations roles can read invoices"
  on business_invoices for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse']));

create or replace function protect_posted_operations_document()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status = 'posted' then
    raise exception 'Cannot delete a posted operations document.';
  end if;

  if tg_op = 'UPDATE' and old.status = 'posted' and new is distinct from old then
    raise exception 'Cannot modify a posted operations document. Create an adjustment document instead.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_protect_posted_operations_document on operations_documents;
create trigger trg_protect_posted_operations_document
before update or delete on operations_documents
for each row execute function protect_posted_operations_document();
