-- Accounting core migration for Pet Travel WholeSale.
-- Run after the baseline schema if your Supabase project already exists.

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

drop policy if exists "internal accounting roles can read periods" on accounting_periods;
create policy "internal accounting roles can read periods"
  on accounting_periods for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

drop policy if exists "internal accounting roles can read accounts" on chart_of_accounts;
create policy "internal accounting roles can read accounts"
  on chart_of_accounts for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

drop policy if exists "internal accounting roles can read documents" on accounting_documents;
create policy "internal accounting roles can read documents"
  on accounting_documents for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

drop policy if exists "internal accounting roles can read journal entries" on journal_entries;
create policy "internal accounting roles can read journal entries"
  on journal_entries for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'accountant']));

drop policy if exists "internal accounting roles can read journal lines" on journal_lines;
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

drop trigger if exists trg_protect_posted_journal_entry on journal_entries;
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

drop trigger if exists trg_protect_posted_journal_lines on journal_lines;
create trigger trg_protect_posted_journal_lines
before update or delete on journal_lines
for each row execute function protect_posted_journal_lines();
