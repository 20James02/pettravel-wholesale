-- Canonical order workflow guards and query indexes.
-- Run after update_v8_drop_exec_sql.sql.

alter table customer_orders drop constraint if exists customer_orders_commercial_status_check;
alter table customer_orders add constraint customer_orders_commercial_status_check
  check (commercial_status in ('draft', 'submitted', 'admin_review', 'quoted', 'customer_accepted', 'locked', 'cancelled')) not valid;

alter table customer_orders drop constraint if exists customer_orders_payment_status_check;
alter table customer_orders add constraint customer_orders_payment_status_check
  check (payment_status in ('unrequested', 'deposit_requested', 'deposit_uploaded', 'deposit_confirmed', 'full_requested', 'full_uploaded', 'paid', 'cod_remaining', 'refunded')) not valid;

alter table customer_orders drop constraint if exists customer_orders_fulfillment_status_check;
alter table customer_orders add constraint customer_orders_fulfillment_status_check
  check (fulfillment_status in ('not_started', 'supplier_checking', 'supplier_confirmed', 'packing', 'ready_to_ship', 'shipped', 'delivered')) not valid;

alter table fulfillment_groups drop constraint if exists fulfillment_groups_status_check;
alter table fulfillment_groups add constraint fulfillment_groups_status_check
  check (status in ('not_started', 'supplier_checking', 'supplier_confirmed', 'packing', 'ready_to_ship', 'shipped', 'delivered')) not valid;

create index if not exists idx_quote_adjustments_quote_approval
  on quote_adjustments (quote_id, requires_approval, approved_by);
create index if not exists idx_payment_proofs_request_uploaded
  on payment_proofs (payment_request_id, uploaded_at desc);
create index if not exists idx_shipments_order_created
  on shipments (order_id, created_at desc);
create index if not exists idx_fulfillment_items_group
  on fulfillment_items (fulfillment_group_id, order_item_id);

create or replace function pt_guard_quote_adjustment_approval()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quote_status quote_status;
begin
  if new.approved_by is not null and not exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = new.approved_by
      and r.key in ('super_admin', 'admin_manager')
  ) then
    raise exception 'Quote adjustment approver must have a manager role.';
  end if;

  select status into v_quote_status from quote_versions where id = new.quote_id;
  if new.requires_approval and new.approved_by is null
     and v_quote_status in ('published', 'accepted') then
    raise exception 'A published quote cannot contain an unapproved adjustment.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_quote_adjustment_approval on quote_adjustments;
create trigger trg_guard_quote_adjustment_approval
before insert or update on quote_adjustments
for each row execute function pt_guard_quote_adjustment_approval();

create or replace function pt_guard_quote_publication()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('published', 'accepted') and exists (
    select 1 from quote_adjustments qa
    where qa.quote_id = new.id
      and qa.requires_approval
      and qa.approved_by is null
  ) then
    raise exception 'Quote has adjustments awaiting manager approval.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_quote_publication on quote_versions;
create trigger trg_guard_quote_publication
before insert or update of status on quote_versions
for each row execute function pt_guard_quote_publication();
