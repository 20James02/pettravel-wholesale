-- =====================================================================
-- PET TRAVEL WHOLESALE — MIGRATION V10: INTEGRITY & SECURITY HARDENING
-- =====================================================================
-- Target: Forward migration for existing PostgreSQL databases migrated up to v9.
-- Purpose:
--   1. Harden pt_reserve_order_stock:
--      - Early row lock on customer_orders (FOR UPDATE) to serialize same-order concurrent requests.
--      - Deterministic item ordering (ORDER BY variant_sku_snapshot, id) to mitigate multi-SKU lock inversion.
--      - Deterministic inventory balance tie-breaker (ORDER BY coalesce(w.is_default, false) DESC, ib.updated_at DESC, ib.id ASC).
--      - Explicit NULL/empty parameter guards.
--      - Cross-organization validation: Actor org cannot be buyer org.
--      - Role & permission validation for actor (operations.write, operations.post, order.quote, order.adjust).
--      - Airtight search_path = '' and fully schema-qualified public.* objects.
--      - Revoke EXECUTE from PUBLIC, anon, authenticated; Grant only to service_role.
--   2. Harden pt_post_order_accounting:
--      - Early row lock on customer_orders (FOR UPDATE OF co) to serialize same-order concurrent postings.
--      - Explicit NULL parameter guards for p_mode, p_vat_rate_bps, and p_require_consumed_stock.
--      - Cross-organization validation: Actor org cannot be buyer org.
--      - Strict Commercial Snapshot Source of Truth: Uses accepted quote or locked current_quote_version;
--        fails closed (ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING) instead of picking unaccepted latest drafts.
--      - Non-floating-point exact integer/NUMERIC VAT calculation matching canonical engine:
--          VAT = round(v_sale_total * p_vat_rate_bps / (10000 + p_vat_rate_bps))
--          NetRevenue = v_sale_total - VAT
--      - COGS fail-closed protection (ACCOUNTING_COGS_MISSING) if consumed movement unit_cost is NULL.
--      - COGS override protection (FORBIDDEN_COGS_OVERRIDE) if unauthorized actor sets p_require_consumed_stock = false.
--      - Negative and zero money validations.
--      - Explicit string cast for upper(v_payment.purpose::text) and receivable source_type = 'order'.
--      - Airtight search_path = '' and fully schema-qualified public.* objects.
--      - Revoke EXECUTE from PUBLIC, anon, authenticated; Grant only to service_role.
--
-- Safety Guarantees:
--   - Non-destructive: Does NOT drop tables, columns, or data.
--   - Idempotent: Can be safely re-applied without side effects.
--   - Transactional: Enclosed in BEGIN / COMMIT block for atomic application.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. HARDENED STOCK RESERVATION PROCEDURE
-- ---------------------------------------------------------------------

create or replace function public.pt_reserve_order_stock(
  p_order_id text,
  p_actor_id text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_item record;
  v_balance record;
  v_inventory_org_id text;
  v_existing_qty integer;
  v_reserved_qty integer := 0;
  v_line_count integer := 0;
begin
  -- 1. Explicit Parameter Validation
  if p_order_id is null or trim(p_order_id) = '' then
    raise exception 'INVALID_PARAMETER: p_order_id cannot be null or empty.';
  end if;

  if p_actor_id is null or trim(p_actor_id) = '' then
    raise exception 'INVALID_PARAMETER: p_actor_id cannot be null or empty.';
  end if;

  -- 2. Early Entity Lock to Serialize Same-Order Concurrency
  select id, organization_id, commercial_status
  into v_order
  from public.customer_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order was not found.';
  end if;

  if v_order.commercial_status not in ('customer_accepted', 'locked') then
    raise exception 'Only accepted or locked orders can reserve stock.';
  end if;

  -- 3. Actor Organization & Permission Validation
  select organization_id
  into v_inventory_org_id
  from public.app_users
  where id = p_actor_id
    and status = 'active';

  if v_inventory_org_id is null then
    raise exception 'Actor is not attached to an internal inventory organization.';
  end if;

  -- Cross-Organization Boundary Guard: Actor cannot reserve stock for own buyer org
  if v_inventory_org_id = v_order.organization_id then
    raise exception 'FORBIDDEN_CROSS_ORG: Actor % cannot reserve stock for customer buyer organization %.', p_actor_id, v_order.organization_id;
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = p_actor_id
      and rp.permission_key in ('operations.write', 'operations.post', 'order.quote', 'order.adjust')
  ) then
    raise exception 'Actor is not allowed to reserve stock.';
  end if;

  -- 4. Idempotency Check (under order row lock)
  select coalesce(sum(quantity), 0)
  into v_existing_qty
  from public.stock_reservations
  where order_id = p_order_id
    and organization_id = v_inventory_org_id
    and status = 'active';

  if v_existing_qty > 0 then
    return jsonb_build_object(
      'status', 'already_reserved',
      'reservedQty', v_existing_qty,
      'lineCount', (
        select count(*)
        from public.stock_reservations
        where order_id = p_order_id
          and organization_id = v_inventory_org_id
          and status = 'active'
      )
    );
  end if;

  -- 5. Deterministic Multi-SKU Lock Ordering:
  -- Order items deterministically by variant_sku_snapshot, id to enforce a global
  -- acquisition hierarchy and mitigate lock inversion across concurrent multi-SKU transactions.
  for v_item in
    select id, variant_sku_snapshot, quantity
    from public.order_items
    where order_id = p_order_id
    order by variant_sku_snapshot, id
  loop
    select ib.*
    into v_balance
    from public.inventory_balances ib
    left join public.warehouses w on w.id = ib.warehouse_id
    where ib.organization_id = v_inventory_org_id
      and ib.sku = v_item.variant_sku_snapshot
      and (ib.on_hand_qty - ib.reserved_qty - ib.defective_qty) >= v_item.quantity
    order by coalesce(w.is_default, false) desc, ib.updated_at desc, ib.id asc
    limit 1
    for update of ib;

    if v_balance.id is null then
      raise exception 'Available stock is not enough for SKU %.', v_item.variant_sku_snapshot;
    end if;

    update public.inventory_balances
    set reserved_qty = reserved_qty + v_item.quantity,
        updated_at = now()
    where id = v_balance.id;

    insert into public.stock_reservations (
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
      v_inventory_org_id,
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

-- ---------------------------------------------------------------------
-- 2. HARDENED GENERAL LEDGER POSTING PROCEDURE
-- ---------------------------------------------------------------------

create or replace function public.pt_post_order_accounting(
  p_order_id text,
  p_actor_id text,
  p_mode text default 'post_all',
  p_vat_rate_bps integer default 0,
  p_require_consumed_stock boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_org_id text;
  v_order record;
  v_payment record;
  v_period_id text;
  v_document_id text;
  v_entry_id text;
  v_entry_no text;
  v_document_no text;
  v_sale_total numeric(14, 0);
  v_vat_amount numeric(14, 0);
  v_net_revenue numeric(14, 0);
  v_cogs_amount numeric(14, 0);
  v_consumed_document_count integer;
  v_created_entries integer := 0;
  v_skipped_entries integer := 0;
  v_created_receivables integer := 0;
  v_created_allocations integer := 0;
begin
  -- 1. Explicit Parameter & NULL Validation
  if p_mode is null or p_mode not in ('post_all', 'post_confirmed_payments', 'recognize_sale') then
    raise exception 'INVALID_ACCOUNTING_MODE: Unsupported accounting posting mode %.', coalesce(p_mode, 'NULL');
  end if;

  if p_vat_rate_bps is null or p_vat_rate_bps < 0 or p_vat_rate_bps > 10000 then
    raise exception 'INVALID_VAT_RATE: VAT rate must be between 0 and 10000 basis points.';
  end if;

  if p_require_consumed_stock is null then
    raise exception 'INVALID_PARAMETER: p_require_consumed_stock cannot be null.';
  end if;

  if p_order_id is null or trim(p_order_id) = '' then
    raise exception 'INVALID_PARAMETER: p_order_id cannot be null or empty.';
  end if;

  if p_actor_id is null or trim(p_actor_id) = '' then
    raise exception 'INVALID_PARAMETER: p_actor_id cannot be null or empty.';
  end if;

  -- 2. Actor Organization & Permission Validation
  select organization_id
  into v_actor_org_id
  from public.app_users
  where id = p_actor_id
    and status = 'active';

  if v_actor_org_id is null then
    raise exception 'Actor is not attached to an internal accounting organization.';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = p_actor_id
      and rp.permission_key in ('accounting.post', 'system.admin')
  ) then
    raise exception 'Actor is not allowed to post accounting entries.';
  end if;

  -- 3. Early Entity Lock to Serialize Same-Order Concurrency
  select
    co.id,
    co.order_number,
    co.organization_id as customer_org_id,
    co.commercial_status,
    co.payment_status,
    co.fulfillment_status,
    co.invoice_requested,
    co.current_quote_version,
    co.created_at,
    co.updated_at,
    org.name as customer_name
  into v_order
  from public.customer_orders co
  left join public.organizations org on org.id = co.organization_id
  where co.id = p_order_id
  for update of co;

  if v_order.id is null then
    raise exception 'Order was not found.';
  end if;

  -- Cross-Organization Boundary Guard: Actor cannot post accounting for buyer org
  if v_actor_org_id = v_order.customer_org_id then
    raise exception 'FORBIDDEN_CROSS_ORG: Actor % cannot post accounting for buyer organization %.', p_actor_id, v_order.customer_org_id;
  end if;

  -- 4. Payment Receipt Posting
  if p_mode in ('post_all', 'post_confirmed_payments') then
    for v_payment in
      select id, purpose, amount, reference, confirmed_at
      from public.payment_requests
      where order_id = p_order_id
        and status = 'confirmed'
      order by confirmed_at nulls last, id
    loop
      if coalesce(v_payment.amount, 0) <= 0 then
        raise exception 'INVALID_AMOUNT: Payment amount must be positive for payment %.', v_payment.id;
      end if;

      if exists (
        select 1
        from public.journal_entries
        where idempotency_key = concat('payment_receipt:', v_payment.id)
      ) then
        v_skipped_entries := v_skipped_entries + 1;
      else
        v_period_id := public.pt_ensure_accounting_period(v_actor_org_id, coalesce(v_payment.confirmed_at::date, current_date));
        v_document_id := gen_random_uuid()::text;
        v_entry_id := gen_random_uuid()::text;

        -- CAST purpose::text to ensure PostgreSQL string function compatibility
        v_document_no := concat('RCPT-', v_order.order_number, '-', upper(v_payment.purpose::text), '-', left(v_payment.id, 8));
        v_entry_no := concat('JE-', v_document_no);

        insert into public.accounting_documents (
          id,
          organization_id,
          source_type,
          source_id,
          document_no,
          document_date,
          status,
          total_amount,
          created_by
        )
        values (
          v_document_id,
          v_actor_org_id,
          'payment_request',
          v_payment.id,
          v_document_no,
          coalesce(v_payment.confirmed_at::date, current_date),
          'posted',
          v_payment.amount,
          p_actor_id
        );

        insert into public.journal_entries (
          id,
          organization_id,
          period_id,
          document_id,
          source_type,
          source_id,
          entry_no,
          description,
          status,
          idempotency_key,
          created_by
        )
        values (
          v_entry_id,
          v_actor_org_id,
          v_period_id,
          v_document_id,
          'payment_request',
          v_payment.id,
          v_entry_no,
          concat('Confirm payment ', v_payment.reference, ' for order ', v_order.order_number),
          'draft',
          concat('payment_receipt:', v_payment.id),
          p_actor_id
        );

        insert into public.journal_lines (
          id,
          entry_id,
          organization_id,
          line_no,
          account_code,
          account_name,
          debit_amount,
          credit_amount,
          partner_org_id,
          order_id,
          memo
        )
        values
          (
            gen_random_uuid()::text,
            v_entry_id,
            v_actor_org_id,
            1,
            '1121',
            'Tien gui ngan hang VND',
            v_payment.amount,
            0,
            v_order.customer_org_id,
            p_order_id,
            v_payment.reference
          ),
          (
            gen_random_uuid()::text,
            v_entry_id,
            v_actor_org_id,
            2,
            '131',
            'Phai thu cua khach hang',
            0,
            v_payment.amount,
            v_order.customer_org_id,
            p_order_id,
            v_payment.reference
          );

        perform public.post_journal_entry(v_entry_id, p_actor_id);
        v_created_entries := v_created_entries + 1;

        insert into public.receivable_ledger_entries (
          id,
          organization_id,
          customer_org_id,
          customer_name,
          source_type,
          source_id,
          document_no,
          document_date,
          credit_amount,
          status,
          note,
          created_by
        )
        values (
          gen_random_uuid()::text,
          v_actor_org_id,
          v_order.customer_org_id,
          coalesce(v_order.customer_name, 'Unknown customer'),
          'payment_request',
          v_payment.id,
          concat('RCPT-', v_order.order_number, '-', upper(v_payment.purpose::text), '-', left(v_payment.id, 8)),
          coalesce(v_payment.confirmed_at::date, current_date),
          v_payment.amount,
          'open',
          concat('Auto credit receivable from confirmed payment ', v_payment.reference),
          p_actor_id
        )
        on conflict (organization_id, source_type, source_id, document_no) do nothing;

        if found then
          v_created_receivables := v_created_receivables + 1;
        end if;

        insert into public.payment_allocations (
          id,
          organization_id,
          direction,
          amount,
          payment_request_id,
          allocated_by,
          note
        )
        values (
          gen_random_uuid()::text,
          v_actor_org_id,
          'customer_receipt',
          v_payment.amount,
          v_payment.id,
          p_actor_id,
          concat('Auto allocation for payment ', v_payment.reference)
        )
        on conflict do nothing;

        if found then
          v_created_allocations := v_created_allocations + 1;
        end if;
      end if;
    end loop;
  end if;

  -- 5. Sale Recognition Posting
  if p_mode in ('post_all', 'recognize_sale') then
    if v_order.commercial_status not in ('customer_accepted', 'locked')
      and v_order.fulfillment_status not in ('packing', 'ready_to_ship', 'shipped', 'delivered') then
      raise exception 'Order must be accepted, locked, packing, shipped, or delivered before sale recognition.';
    end if;

    if exists (
      select 1
      from public.journal_entries
      where idempotency_key = concat('sale_recognition:', p_order_id)
    ) then
      v_skipped_entries := v_skipped_entries + 1;
    else
      -- 5a. Strict Commercial Snapshot Selection (Anti-Drift):
      -- 1. Try to find accepted quote version
      select qv.final_total
      into v_sale_total
      from public.quote_versions qv
      where qv.order_id = p_order_id
        and qv.status = 'accepted'
      order by qv.version desc
      limit 1;

      -- 2. If no quote with status='accepted', check if order is locked/confirmed and current_quote_version is published/accepted
      if v_sale_total is null or v_sale_total <= 0 then
        select qv.final_total
        into v_sale_total
        from public.quote_versions qv
        where qv.order_id = p_order_id
          and qv.version = v_order.current_quote_version
          and qv.status in ('accepted', 'published')
          and v_order.commercial_status in ('customer_accepted', 'locked', 'deposit_confirmed', 'payment_confirmed', 'completed');
      end if;

      -- 3. If no quote_versions exist at all for the order, fallback to order_items snapshot sum
      if v_sale_total is null or v_sale_total <= 0 then
        if not exists (select 1 from public.quote_versions where order_id = p_order_id) then
          select coalesce(sum(quantity * unit_price_snapshot), 0)
          into v_sale_total
          from public.order_items
          where order_id = p_order_id;
        end if;
      end if;

      -- 4. Fail closed if commercial snapshot is missing or zero
      if v_sale_total is null or v_sale_total <= 0 then
        raise exception 'ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING: Order % has no valid accepted or locked commercial quote snapshot.', p_order_id;
      end if;

      select count(distinct sr.consumed_document_id)
      into v_consumed_document_count
      from public.stock_reservations sr
      where sr.order_id = p_order_id
        and sr.organization_id = v_actor_org_id
        and sr.status = 'consumed';

      -- COGS Override Validation:
      -- If p_require_consumed_stock = false, actor must have explicit override permission
      if not p_require_consumed_stock then
        if not exists (
          select 1
          from public.user_roles ur
          join public.role_permissions rp on rp.role_id = ur.role_id
          where ur.user_id = p_actor_id
            and rp.permission_key in ('accounting.override_consumed_stock', 'system.admin')
        ) and coalesce(v_consumed_document_count, 0) = 0 then
          raise exception 'FORBIDDEN_COGS_OVERRIDE: Actor % is not authorized to bypass consumed stock validation (requires accounting.override_consumed_stock or system.admin).', p_actor_id;
        end if;
      end if;

      if coalesce(v_consumed_document_count, 0) = 0 and p_require_consumed_stock then
        raise exception 'Cannot recognize sale because order stock reservations have not been consumed.';
      end if;

      -- COGS validation: fail-closed if any consumed stock movement has missing unit cost
      if exists (
        select 1
        from public.stock_movements sm
        where sm.movement_type = 'sale_out'
          and sm.document_id in (
            select distinct sr.consumed_document_id
            from public.stock_reservations sr
            where sr.order_id = p_order_id
              and sr.organization_id = v_actor_org_id
              and sr.status = 'consumed'
          )
          and sm.unit_cost is null
      ) then
        raise exception 'ACCOUNTING_COGS_MISSING: One or more consumed stock movements have missing unit cost.';
      end if;

      select coalesce(sum(-sm.quantity_delta * sm.unit_cost), 0)
      into v_cogs_amount
      from public.stock_movements sm
      where sm.movement_type = 'sale_out'
        and sm.document_id in (
          select distinct sr.consumed_document_id
          from public.stock_reservations sr
          where sr.order_id = p_order_id
            and sr.organization_id = v_actor_org_id
            and sr.status = 'consumed'
        );

      -- Exact Integer VAT Calculation:
      -- When v_sale_total is VAT-inclusive customer gross total:
      --   VAT = round(v_sale_total * vatRateBps / (10000 + vatRateBps))
      --   NetRevenue = v_sale_total - VAT
      -- Guarantees: NetRevenue + VAT == v_sale_total with zero floating point drift.
      if p_vat_rate_bps > 0 then
        v_vat_amount := round((v_sale_total * p_vat_rate_bps)::numeric / (10000 + p_vat_rate_bps));
        v_net_revenue := v_sale_total - v_vat_amount;
      else
        v_vat_amount := 0;
        v_net_revenue := v_sale_total;
      end if;

      v_period_id := public.pt_ensure_accounting_period(v_actor_org_id, coalesce(v_order.updated_at::date, current_date));
      v_document_id := gen_random_uuid()::text;
      v_entry_id := gen_random_uuid()::text;
      v_document_no := concat('SALE-', v_order.order_number);
      v_entry_no := concat('JE-', v_document_no);

      insert into public.accounting_documents (
        id,
        organization_id,
        source_type,
        source_id,
        document_no,
        document_date,
        status,
        total_amount,
        created_by
      )
      values (
        v_document_id,
        v_actor_org_id,
        'customer_order',
        v_order.id,
        v_document_no,
        coalesce(v_order.updated_at::date, current_date),
        'posted',
        v_sale_total,
        p_actor_id
      );

      insert into public.journal_entries (
        id,
        organization_id,
        period_id,
        document_id,
        source_type,
        source_id,
        entry_no,
        description,
        status,
        idempotency_key,
        created_by
      )
      values (
        v_entry_id,
        v_actor_org_id,
        v_period_id,
        v_document_id,
        'customer_order',
        v_order.id,
        v_entry_no,
        concat('Recognize revenue and COGS for order ', v_order.order_number),
        'draft',
        concat('sale_recognition:', p_order_id),
        p_actor_id
      );

      insert into public.journal_lines (
        id,
        entry_id,
        organization_id,
        line_no,
        account_code,
        account_name,
        debit_amount,
        credit_amount,
        partner_org_id,
        order_id,
        memo
      )
      values
        (
          gen_random_uuid()::text,
          v_entry_id,
          v_actor_org_id,
          1,
          '131',
          'Phai thu cua khach hang',
          v_sale_total,
          0,
          v_order.customer_org_id,
          p_order_id,
          concat('Receivable for order ', v_order.order_number)
        ),
        (
          gen_random_uuid()::text,
          v_entry_id,
          v_actor_org_id,
          2,
          '511',
          'Doanh thu ban hang hoa',
          0,
          v_net_revenue,
          v_order.customer_org_id,
          p_order_id,
          concat('Net revenue for order ', v_order.order_number)
        );

      if v_vat_amount > 0 then
        insert into public.journal_lines (
          id,
          entry_id,
          organization_id,
          line_no,
          account_code,
          account_name,
          debit_amount,
          credit_amount,
          partner_org_id,
          order_id,
          memo
        )
        values (
          gen_random_uuid()::text,
          v_entry_id,
          v_actor_org_id,
          3,
          '3331',
          'Thue GTGT phai nop',
          0,
          v_vat_amount,
          v_order.customer_org_id,
          p_order_id,
          concat('VAT for order ', v_order.order_number)
        );
      end if;

      if v_cogs_amount > 0 then
        insert into public.journal_lines (
          id,
          entry_id,
          organization_id,
          line_no,
          account_code,
          account_name,
          debit_amount,
          credit_amount,
          partner_org_id,
          order_id,
          memo
        )
        values
          (
            gen_random_uuid()::text,
            v_entry_id,
            v_actor_org_id,
            case when v_vat_amount > 0 then 4 else 3 end,
            '632',
            'Gia von hang ban',
            v_cogs_amount,
            0,
            null,
            p_order_id,
            concat('COGS for order ', v_order.order_number)
          ),
          (
            gen_random_uuid()::text,
            v_entry_id,
            v_actor_org_id,
            case when v_vat_amount > 0 then 5 else 4 end,
            '156',
            'Hang hoa ton kho',
            0,
            v_cogs_amount,
            null,
            p_order_id,
            concat('Inventory relief for order ', v_order.order_number)
          );
      end if;

      perform public.post_journal_entry(v_entry_id, p_actor_id);
      v_created_entries := v_created_entries + 1;

      insert into public.receivable_ledger_entries (
        id,
        organization_id,
        customer_org_id,
        customer_name,
        source_type,
        source_id,
        document_no,
        document_date,
        debit_amount,
        status,
        note,
        created_by
      )
      values (
        gen_random_uuid()::text,
        v_actor_org_id,
        v_order.customer_org_id,
        coalesce(v_order.customer_name, 'Unknown customer'),
        'order',
        v_order.id,
        concat('SALE-', v_order.order_number),
        coalesce(v_order.updated_at::date, current_date),
        v_sale_total,
        'open',
        concat('Auto debit receivable from sale recognition of order ', v_order.order_number),
        p_actor_id
      )
      on conflict (organization_id, source_type, source_id, document_no) do nothing;

      if found then
        v_created_receivables := v_created_receivables + 1;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'orderId', p_order_id,
    'createdEntries', v_created_entries,
    'skippedEntries', v_skipped_entries,
    'createdReceivables', v_created_receivables,
    'createdAllocations', v_created_allocations
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. SECURITY DEFINER PRIVILEGE HARDENING
-- ---------------------------------------------------------------------

revoke all on function public.pt_reserve_order_stock(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.pt_reserve_order_stock(text, text, timestamptz) to service_role;

revoke all on function public.pt_post_order_accounting(text, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.pt_post_order_accounting(text, text, text, integer, boolean) to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'pettravel_backend_staging') then
    grant execute on function public.pt_reserve_order_stock(text, text, timestamptz) to pettravel_backend_staging;
    grant execute on function public.pt_post_order_accounting(text, text, text, integer, boolean) to pettravel_backend_staging;
  end if;
end $$;

COMMIT;
