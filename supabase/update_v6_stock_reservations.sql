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
  release_note text
);

alter table stock_reservations add column if not exists release_note text;

alter table stock_reservations
  drop constraint if exists stock_reservations_organization_id_order_id_order_item_id_sku_snapshot_key;

create unique index if not exists idx_stock_reservations_active_unique
  on stock_reservations (organization_id, order_id, order_item_id, sku_snapshot)
  where status = 'active';

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

create or replace function pt_reserve_order_stock(
  p_order_id text,
  p_actor_id text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_balance record;
  v_existing_qty integer;
  v_reserved_qty integer := 0;
  v_line_count integer := 0;
begin
  select id, organization_id, commercial_status
  into v_order
  from customer_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order was not found.';
  end if;

  if v_order.commercial_status not in ('customer_accepted', 'locked') then
    raise exception 'Only accepted or locked orders can reserve stock.';
  end if;

  select coalesce(sum(quantity), 0)
  into v_existing_qty
  from stock_reservations
  where order_id = p_order_id
    and status = 'active';

  if v_existing_qty > 0 then
    return jsonb_build_object(
      'status', 'already_reserved',
      'reservedQty', v_existing_qty,
      'lineCount', (select count(*) from stock_reservations where order_id = p_order_id and status = 'active')
    );
  end if;

  for v_item in
    select id, variant_sku_snapshot, quantity
    from order_items
    where order_id = p_order_id
    order by id
  loop
    select ib.*
    into v_balance
    from inventory_balances ib
    left join warehouses w on w.id = ib.warehouse_id
    where ib.organization_id = v_order.organization_id
      and ib.sku = v_item.variant_sku_snapshot
      and (ib.on_hand_qty - ib.reserved_qty - ib.defective_qty) >= v_item.quantity
    order by coalesce(w.is_default, false) desc, ib.updated_at desc
    limit 1
    for update of ib;

    if v_balance.id is null then
      raise exception 'Available stock is not enough for SKU %.', v_item.variant_sku_snapshot;
    end if;

    update inventory_balances
    set reserved_qty = reserved_qty + v_item.quantity,
        updated_at = now()
    where id = v_balance.id;

    insert into stock_reservations (
      organization_id,
      warehouse_id,
      order_id,
      order_item_id,
      product_variant_id,
      sku_snapshot,
      quantity,
      status,
      expires_at,
      created_by
    )
    values (
      v_order.organization_id,
      v_balance.warehouse_id,
      p_order_id,
      v_item.id,
      v_balance.product_variant_id,
      v_item.variant_sku_snapshot,
      v_item.quantity,
      'active',
      p_expires_at,
      p_actor_id
    );

    v_reserved_qty := v_reserved_qty + v_item.quantity;
    v_line_count := v_line_count + 1;
  end loop;

  if v_line_count = 0 then
    raise exception 'Order has no items to reserve.';
  end if;

  return jsonb_build_object('status', 'reserved', 'reservedQty', v_reserved_qty, 'lineCount', v_line_count);
end;
$$;

create or replace function pt_transition_order_stock_reservations(
  p_order_id text,
  p_actor_id text,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation record;
  v_balance record;
  v_next_status text;
  v_document_id text;
  v_document_no text;
  v_line_no integer := 0;
  v_total_qty integer := 0;
  v_line_count integer := 0;
begin
  if p_action not in ('release_order', 'expire_order', 'consume_order', 'cancel_order') then
    raise exception 'Unsupported reservation action %.', p_action;
  end if;

  v_next_status := case p_action
    when 'release_order' then 'released'
    when 'expire_order' then 'expired'
    when 'consume_order' then 'consumed'
    when 'cancel_order' then 'cancelled'
  end;

  for v_reservation in
    select *
    from stock_reservations
    where order_id = p_order_id
      and status = 'active'
    order by created_at
    for update
  loop
    if p_action = 'consume_order' and v_document_id is null then
      v_document_id := gen_random_uuid()::text;
      v_document_no := concat('AUTO-SALE-', left(p_order_id, 18), '-', extract(epoch from clock_timestamp())::bigint);

      insert into operations_documents (
        id,
        organization_id,
        type,
        document_no,
        status,
        partner_name,
        total_amount,
        note,
        created_by,
        posted_by,
        posted_at
      )
      values (
        v_document_id,
        v_reservation.organization_id,
        'sales_invoice',
        v_document_no,
        'posted',
        'Pet Travel wholesale order',
        0,
        concat('Auto-created from order ', p_order_id, ' when consuming stock reservations.'),
        p_actor_id,
        p_actor_id,
        now()
      );
    end if;

    select *
    into v_balance
    from inventory_balances
    where organization_id = v_reservation.organization_id
      and warehouse_id = v_reservation.warehouse_id
      and sku = v_reservation.sku_snapshot
    for update;

    if v_balance.id is null then
      raise exception 'Inventory balance was not found for reserved SKU %.', v_reservation.sku_snapshot;
    end if;

    if p_action = 'consume_order' then
      if v_balance.on_hand_qty < v_reservation.quantity then
        raise exception 'On-hand stock is not enough to consume reserved SKU %.', v_reservation.sku_snapshot;
      end if;

      update inventory_balances
      set reserved_qty = greatest(reserved_qty - v_reservation.quantity, 0),
          on_hand_qty = on_hand_qty - v_reservation.quantity,
          updated_at = now()
      where id = v_balance.id;

      v_line_no := v_line_no + 1;

      insert into operations_document_lines (
        id,
        document_id,
        organization_id,
        line_no,
        product_variant_id,
        sku_snapshot,
        description,
        quantity,
        unit_cost,
        total_cost,
        supplier_id
      )
      values (
        gen_random_uuid()::text,
        v_document_id,
        v_reservation.organization_id,
        v_line_no,
        v_reservation.product_variant_id,
        v_reservation.sku_snapshot,
        concat('Auto sale-out for order ', p_order_id, ' / SKU ', v_reservation.sku_snapshot),
        v_reservation.quantity,
        coalesce(v_balance.avg_cost_vnd, 0),
        v_reservation.quantity * coalesce(v_balance.avg_cost_vnd, 0),
        v_balance.supplier_id
      );

      insert into stock_movements (
        id,
        organization_id,
        warehouse_id,
        document_id,
        product_variant_id,
        sku_snapshot,
        movement_type,
        quantity_delta,
        defective_delta,
        unit_cost,
        created_by
      )
      values (
        gen_random_uuid()::text,
        v_reservation.organization_id,
        v_reservation.warehouse_id,
        v_document_id,
        v_reservation.product_variant_id,
        v_reservation.sku_snapshot,
        'sale_out',
        -v_reservation.quantity,
        0,
        coalesce(v_balance.avg_cost_vnd, 0),
        p_actor_id
      );
    else
      update inventory_balances
      set reserved_qty = greatest(reserved_qty - v_reservation.quantity, 0),
          updated_at = now()
      where id = v_balance.id;
    end if;

    update stock_reservations
    set status = v_next_status,
        released_at = now(),
        release_reason = coalesce(p_reason, p_action),
        release_note = concat('Actor ', p_actor_id, ' executed ', p_action)
    where id = v_reservation.id;

    v_total_qty := v_total_qty + v_reservation.quantity;
    v_line_count := v_line_count + 1;
  end loop;

  if p_action = 'consume_order' and v_document_id is not null then
    update operations_documents
    set total_amount = (
      select coalesce(sum(total_cost), 0)
      from operations_document_lines
      where document_id = v_document_id
    )
    where id = v_document_id;

    insert into business_invoices (
      id,
      organization_id,
      operations_document_id,
      invoice_no,
      invoice_type,
      status,
      partner_name,
      total_amount,
      issued_at
    )
    select
      gen_random_uuid()::text,
      organization_id,
      id,
      document_no,
      'sales',
      'issued',
      partner_name,
      total_amount,
      posted_at
    from operations_documents
    where id = v_document_id
    on conflict (operations_document_id) do nothing;
  end if;

  return jsonb_build_object(
    'status', v_next_status,
    'releasedQty', v_total_qty,
    'lineCount', v_line_count,
    'documentId', v_document_id
  );
end;
$$;
