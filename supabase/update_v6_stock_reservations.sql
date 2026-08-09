-- Stock reservation foundation for accepted/locked B2B orders.
-- Run after update_v5_receivables_reconciliation.sql.

create table if not exists stock_reservations (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  warehouse_id text references warehouses(id) on delete set null,
  order_id text not null references customer_orders(id) on delete cascade,
  order_item_id text references order_items(id) on delete set null,
  product_variant_id text references product_variants(id) on delete set null,
  sku_snapshot text not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'released', 'consumed', 'expired', 'cancelled')),
  expires_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_by text references app_users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, order_id, order_item_id, sku_snapshot)
);

create index if not exists idx_stock_reservations_org_status_expiry on stock_reservations (organization_id, status, expires_at);
create index if not exists idx_stock_reservations_order on stock_reservations (order_id, status);
create index if not exists idx_stock_reservations_sku on stock_reservations (organization_id, sku_snapshot, status);

alter table stock_reservations enable row level security;

drop policy if exists "internal operations roles can read stock reservations" on stock_reservations;
create policy "internal operations roles can read stock reservations"
  on stock_reservations for select
  using (current_app_user_has_role(array['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse']));

create or replace function protect_consumed_stock_reservation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status = 'consumed' then
    raise exception 'Cannot delete a consumed stock reservation.';
  end if;

  if tg_op = 'UPDATE' and old.status = 'consumed' and new is distinct from old then
    raise exception 'Cannot modify a consumed stock reservation. Create a correcting reservation or stock movement instead.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_protect_consumed_stock_reservation on stock_reservations;
create trigger trg_protect_consumed_stock_reservation
before update or delete on stock_reservations
for each row execute function protect_consumed_stock_reservation();
