-- Order accounting automation for Pet Travel WholeSale.
-- Run after update_v6_stock_reservations.sql.

create unique index if not exists idx_payment_allocations_unique_payment_request
  on payment_allocations (organization_id, payment_request_id, direction)
  where payment_request_id is not null;

create or replace function pt_ensure_accounting_period(
  p_organization_id text,
  p_entry_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_id text;
  v_code text;
  v_start_date date;
  v_end_date date;
begin
  if p_organization_id is null then
    raise exception 'Accounting organization is required.';
  end if;

  v_start_date := date_trunc('month', p_entry_date)::date;
  v_end_date := (date_trunc('month', p_entry_date)::date + interval '1 month - 1 day')::date;
  v_code := to_char(v_start_date, 'YYYY-MM');

  select id
  into v_period_id
  from accounting_periods
  where organization_id = p_organization_id
    and code = v_code;

  if v_period_id is null then
    v_period_id := gen_random_uuid()::text;

    insert into accounting_periods (
      id,
      organization_id,
      code,
      start_date,
      end_date,
      status
    )
    values (
      v_period_id,
      p_organization_id,
      v_code,
      v_start_date,
      v_end_date,
      'open'
    )
    on conflict (organization_id, code) do nothing;

    select id
    into v_period_id
    from accounting_periods
    where organization_id = p_organization_id
      and code = v_code;
  end if;

  if exists (
    select 1
    from accounting_periods
    where id = v_period_id
      and status = 'closed'
  ) then
    raise exception 'Cannot post accounting automation into a closed period %.', v_code;
  end if;

  return v_period_id;
end;
$$;

create or replace function pt_post_order_accounting(
  p_order_id text,
  p_actor_id text,
  p_mode text default 'post_all',
  p_vat_rate_bps integer default 0,
  p_require_consumed_stock boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  if p_mode not in ('post_all', 'post_confirmed_payments', 'recognize_sale') then
    raise exception 'Unsupported accounting posting mode %.', p_mode;
  end if;

  if p_vat_rate_bps < 0 or p_vat_rate_bps > 10000 then
    raise exception 'VAT rate must be between 0 and 10000 basis points.';
  end if;

  select organization_id
  into v_actor_org_id
  from app_users
  where id = p_actor_id
    and status = 'active';

  if v_actor_org_id is null then
    raise exception 'Actor is not attached to an internal accounting organization.';
  end if;

  select
    co.id,
    co.order_number,
    co.organization_id as customer_org_id,
    co.commercial_status,
    co.payment_status,
    co.fulfillment_status,
    co.invoice_requested,
    co.created_at,
    co.updated_at,
    org.name as customer_name
  into v_order
  from customer_orders co
  left join organizations org on org.id = co.organization_id
  where co.id = p_order_id;

  if v_order.id is null then
    raise exception 'Order was not found.';
  end if;

  if p_mode in ('post_all', 'post_confirmed_payments') then
    for v_payment in
      select id, purpose, amount, reference, confirmed_at
      from payment_requests
      where order_id = p_order_id
        and status = 'confirmed'
      order by confirmed_at nulls last, id
    loop
      if exists (
        select 1
        from journal_entries
        where idempotency_key = concat('payment_receipt:', v_payment.id)
      ) then
        v_skipped_entries := v_skipped_entries + 1;
      else
        v_period_id := pt_ensure_accounting_period(v_actor_org_id, coalesce(v_payment.confirmed_at::date, current_date));
        v_document_id := gen_random_uuid()::text;
        v_entry_id := gen_random_uuid()::text;
        v_document_no := concat('RCPT-', v_order.order_number, '-', upper(v_payment.purpose), '-', left(v_payment.id, 8));
        v_entry_no := concat('JE-', v_document_no);

        insert into accounting_documents (
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

        insert into journal_entries (
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

        insert into journal_lines (
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

        perform post_journal_entry(v_entry_id, p_actor_id);
        v_created_entries := v_created_entries + 1;
      end if;

      insert into receivable_ledger_entries (
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
        concat('RCPT-', v_order.order_number, '-', upper(v_payment.purpose), '-', left(v_payment.id, 8)),
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

      insert into payment_allocations (
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
    end loop;
  end if;

  if p_mode in ('post_all', 'recognize_sale') then
    if v_order.commercial_status not in ('customer_accepted', 'locked')
      and v_order.fulfillment_status not in ('packing', 'ready_to_ship', 'shipped', 'delivered') then
      raise exception 'Order must be accepted, locked, packing, shipped, or delivered before sale recognition.';
    end if;

    if exists (
      select 1
      from journal_entries
      where idempotency_key = concat('sale_recognition:', p_order_id)
    ) then
      v_skipped_entries := v_skipped_entries + 1;
    else
      select coalesce(qv.final_total, 0)
      into v_sale_total
      from quote_versions qv
      where qv.order_id = p_order_id
      order by qv.version desc
      limit 1;

      if coalesce(v_sale_total, 0) <= 0 then
        select coalesce(sum(quantity * unit_price_snapshot), 0)
        into v_sale_total
        from order_items
        where order_id = p_order_id;
      end if;

      if coalesce(v_sale_total, 0) <= 0 then
        raise exception 'Order sale total is not positive.';
      end if;

      select count(distinct sr.consumed_document_id)
      into v_consumed_document_count
      from stock_reservations sr
      where sr.order_id = p_order_id
        and sr.organization_id = v_actor_org_id
        and sr.status = 'consumed';

      select coalesce(sum(-sm.quantity_delta * sm.unit_cost), 0)
      into v_cogs_amount
      from stock_movements sm
      where sm.movement_type = 'sale_out'
        and sm.document_id in (
          select distinct sr.consumed_document_id
          from stock_reservations sr
          where sr.order_id = p_order_id
            and sr.organization_id = v_actor_org_id
            and sr.status = 'consumed'
            and sr.consumed_document_id is not null
        );

      if p_require_consumed_stock and coalesce(v_consumed_document_count, 0) = 0 then
        raise exception 'Consume reserved stock before recognizing sale accounting.';
      end if;

      v_vat_amount := round((v_sale_total * p_vat_rate_bps)::numeric / (10000 + p_vat_rate_bps));
      v_net_revenue := v_sale_total - v_vat_amount;
      v_period_id := pt_ensure_accounting_period(v_actor_org_id, current_date);
      v_document_id := gen_random_uuid()::text;
      v_entry_id := gen_random_uuid()::text;
      v_document_no := concat('SALE-', v_order.order_number);
      v_entry_no := concat('JE-', v_document_no);

      insert into accounting_documents (
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
        'order',
        p_order_id,
        v_document_no,
        current_date,
        'posted',
        v_sale_total,
        p_actor_id
      );

      insert into journal_entries (
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
        'order',
        p_order_id,
        v_entry_no,
        concat('Recognize sale for order ', v_order.order_number),
        'draft',
        concat('sale_recognition:', p_order_id),
        p_actor_id
      );

      insert into journal_lines (
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
          v_order.order_number
        ),
        (
          gen_random_uuid()::text,
          v_entry_id,
          v_actor_org_id,
          2,
          '5111',
          'Doanh thu ban hang hoa',
          0,
          v_net_revenue,
          v_order.customer_org_id,
          p_order_id,
          v_order.order_number
        );

      if v_vat_amount > 0 then
        insert into journal_lines (
          id, entry_id, organization_id, line_no, account_code, account_name,
          debit_amount, credit_amount, partner_org_id, order_id, memo
        )
        values (
          gen_random_uuid()::text, v_entry_id, v_actor_org_id, 3, '33311', 'Thue GTGT dau ra',
          0, v_vat_amount, v_order.customer_org_id, p_order_id, v_order.order_number
        );
      end if;

      if coalesce(v_cogs_amount, 0) > 0 then
        insert into journal_lines (
          id, entry_id, organization_id, line_no, account_code, account_name,
          debit_amount, credit_amount, partner_org_id, order_id, memo
        )
        values
          (
            gen_random_uuid()::text, v_entry_id, v_actor_org_id,
            case when v_vat_amount > 0 then 4 else 3 end,
            '632', 'Gia von hang ban',
            v_cogs_amount, 0, v_order.customer_org_id, p_order_id, v_order.order_number
          ),
          (
            gen_random_uuid()::text, v_entry_id, v_actor_org_id,
            case when v_vat_amount > 0 then 5 else 4 end,
            '156', 'Hang hoa',
            0, v_cogs_amount, v_order.customer_org_id, p_order_id, v_order.order_number
          );
      end if;

      perform post_journal_entry(v_entry_id, p_actor_id);
      v_created_entries := v_created_entries + 1;

      insert into receivable_ledger_entries (
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
        p_order_id,
        v_document_no,
        current_date,
        v_sale_total,
        'open',
        concat('Auto debit receivable from sale recognition ', v_order.order_number),
        p_actor_id
      )
      on conflict (organization_id, source_type, source_id, document_no) do nothing;

      if found then
        v_created_receivables := v_created_receivables + 1;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'posted',
    'mode', p_mode,
    'createdEntries', v_created_entries,
    'skippedEntries', v_skipped_entries,
    'createdReceivables', v_created_receivables,
    'createdAllocations', v_created_allocations
  );
end;
$$;
