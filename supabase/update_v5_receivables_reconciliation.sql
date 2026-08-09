-- Receivables, payables, bank transactions, payment allocations, and reconciliation foundation.
-- Run after update_v4_operations.sql.

create table if not exists bank_accounts (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  code text not null,
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  currency text not null default 'VND' check (currency = 'VND'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, bank_name, account_number)
);

create table if not exists bank_transactions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  bank_account_id text references bank_accounts(id) on delete set null,
  transaction_date date not null,
  value_at timestamptz,
  direction text not null check (direction in ('in', 'out')),
  amount numeric(14, 0) not null check (amount > 0),
  currency text not null default 'VND' check (currency = 'VND'),
  bank_reference text,
  counterparty_name text,
  counterparty_account text,
  description text,
  raw_payload jsonb not null default '{}'::jsonb,
  reconciliation_status text not null default 'unmatched' check (reconciliation_status in ('unmatched', 'matched', 'partially_matched', 'ignored')),
  imported_by text references app_users(id),
  imported_at timestamptz not null default now(),
  unique (organization_id, bank_account_id, bank_reference, amount, transaction_date)
);

create table if not exists receivable_ledger_entries (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  customer_org_id text references organizations(id),
  customer_name text not null,
  source_type text not null check (source_type in ('order', 'sales_invoice', 'payment_request', 'refund', 'manual_adjustment')),
  source_id text not null,
  document_no text not null,
  document_date date not null default current_date,
  due_date date,
  debit_amount numeric(14, 0) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(14, 0) not null default 0 check (credit_amount >= 0),
  status text not null default 'open' check (status in ('open', 'partially_paid', 'settled', 'void')),
  note text,
  created_by text references app_users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, source_type, source_id, document_no),
  check (
    (debit_amount > 0 and credit_amount = 0)
    or
    (credit_amount > 0 and debit_amount = 0)
  )
);

create table if not exists payable_ledger_entries (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  supplier_id text references suppliers(id),
  partner_name text not null,
  source_type text not null check (source_type in ('purchase_receipt', 'supplier_invoice', 'expense', 'supplier_payment', 'shipping_bill', 'manual_adjustment')),
  source_id text not null,
  document_no text not null,
  document_date date not null default current_date,
  due_date date,
  debit_amount numeric(14, 0) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(14, 0) not null default 0 check (credit_amount >= 0),
  status text not null default 'open' check (status in ('open', 'partially_paid', 'settled', 'void')),
  note text,
  created_by text references app_users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, source_type, source_id, document_no),
  check (
    (debit_amount > 0 and credit_amount = 0)
    or
    (credit_amount > 0 and debit_amount = 0)
  )
);

create table if not exists payment_allocations (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  direction text not null check (direction in ('customer_receipt', 'supplier_payment', 'refund', 'cod_collection')),
  amount numeric(14, 0) not null check (amount > 0),
  currency text not null default 'VND' check (currency = 'VND'),
  bank_transaction_id text references bank_transactions(id) on delete set null,
  payment_request_id text references payment_requests(id) on delete set null,
  receivable_entry_id text references receivable_ledger_entries(id) on delete set null,
  payable_entry_id text references payable_ledger_entries(id) on delete set null,
  allocated_by text references app_users(id),
  allocated_at timestamptz not null default now(),
  note text,
  check (
    receivable_entry_id is not null
    or payable_entry_id is not null
    or payment_request_id is not null
  )
);

create table if not exists reconciliation_batches (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  type text not null check (type in ('bank', 'cod', 'supplier', 'shipping', 'inventory', 'google_sheet')),
  batch_no text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed', 'void')),
  source_name text not null,
  period_start date,
  period_end date,
  total_external_amount numeric(14, 0) not null default 0 check (total_external_amount >= 0),
  total_matched_amount numeric(14, 0) not null default 0 check (total_matched_amount >= 0),
  total_difference_amount numeric(14, 0) not null default 0 check (total_difference_amount >= 0),
  checksum text,
  created_by text references app_users(id),
  closed_by text references app_users(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, batch_no)
);

create table if not exists reconciliation_items (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  batch_id text not null references reconciliation_batches(id) on delete cascade,
  external_reference text,
  internal_source_type text,
  internal_source_id text,
  bank_transaction_id text references bank_transactions(id) on delete set null,
  expected_amount numeric(14, 0) not null default 0 check (expected_amount >= 0),
  actual_amount numeric(14, 0) not null default 0 check (actual_amount >= 0),
  difference_amount numeric(14, 0) not null default 0 check (difference_amount >= 0),
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'partial', 'overpaid', 'underpaid', 'ignored', 'resolved')),
  resolution_note text,
  resolved_by text references app_users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_bank_transactions_org_date_status on bank_transactions (organization_id, transaction_date desc, reconciliation_status);
create index if not exists idx_receivable_org_status_due on receivable_ledger_entries (organization_id, status, due_date);
create index if not exists idx_payable_org_status_due on payable_ledger_entries (organization_id, status, due_date);
create index if not exists idx_payment_allocations_org_direction on payment_allocations (organization_id, direction, allocated_at desc);
create index if not exists idx_reconciliation_batches_org_status on reconciliation_batches (organization_id, status, created_at desc);
create index if not exists idx_reconciliation_items_batch_status on reconciliation_items (batch_id, status);

alter table bank_accounts enable row level security;
alter table bank_transactions enable row level security;
alter table receivable_ledger_entries enable row level security;
alter table payable_ledger_entries enable row level security;
alter table payment_allocations enable row level security;
alter table reconciliation_batches enable row level security;
alter table reconciliation_items enable row level security;

drop policy if exists "internal finance roles can read bank accounts" on bank_accounts;
create policy "internal finance roles can read bank accounts"
  on bank_accounts for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

drop policy if exists "internal finance roles can read bank transactions" on bank_transactions;
create policy "internal finance roles can read bank transactions"
  on bank_transactions for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

drop policy if exists "internal finance roles can read receivables" on receivable_ledger_entries;
create policy "internal finance roles can read receivables"
  on receivable_ledger_entries for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

drop policy if exists "internal finance roles can read payables" on payable_ledger_entries;
create policy "internal finance roles can read payables"
  on payable_ledger_entries for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

drop policy if exists "internal finance roles can read allocations" on payment_allocations;
create policy "internal finance roles can read allocations"
  on payment_allocations for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

drop policy if exists "internal finance roles can read reconciliation batches" on reconciliation_batches;
create policy "internal finance roles can read reconciliation batches"
  on reconciliation_batches for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

drop policy if exists "internal finance roles can read reconciliation items" on reconciliation_items;
create policy "internal finance roles can read reconciliation items"
  on reconciliation_items for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

create or replace function protect_closed_reconciliation_batch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status = 'closed' then
    raise exception 'Cannot delete a closed reconciliation batch.';
  end if;

  if tg_op = 'UPDATE' and old.status = 'closed' and new is distinct from old then
    raise exception 'Cannot modify a closed reconciliation batch. Create a new adjustment batch instead.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_protect_closed_reconciliation_batch on reconciliation_batches;
create trigger trg_protect_closed_reconciliation_batch
before update or delete on reconciliation_batches
for each row execute function protect_closed_reconciliation_batch();
