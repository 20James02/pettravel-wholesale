-- =====================================================================
-- PET TRAVEL WHOLESALE — V12 COMMERCIAL SOT HARDENING FORWARD MIGRATION
-- =====================================================================
-- Target: Forward reconciliation on top of immutable V11
-- Purpose: Enforce strict, fail-closed Commercial Source-of-Truth (SOT)
--          semantics for sale recognition accounting:
--          1. ONLY an unambiguous accepted quote version (status = 'accepted'
--             and final_total > 0) is authoritative for revenue & AR receivable.
--          2. Remove unsafe fallback to published-only quote versions.
--          3. Remove unsafe fallback to raw unadjusted order_items sums.
--          4. Reject ambiguous multi-accepted quote states.
--          5. Preserve deposit / payment posting for post_confirmed_payments mode.
--          6. Maintain SECURITY DEFINER, search_path = '', and zero-trust ACLs.
-- =====================================================================

BEGIN;

-- Session timeouts prevent indefinite lock queueing
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ---------------------------------------------------------------------
-- 1. HARDENED GENERAL LEDGER POSTING PROCEDURE (STRICT COMMERCIAL SOT)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_post_order_accounting(
  p_order_id text,
  p_actor_id text,
  p_mode text DEFAULT 'post_all',
  p_vat_rate_bps integer DEFAULT 0,
  p_require_consumed_stock boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_org_id text;
  v_order record;
  v_payment record;
  v_period_id text;
  v_document_id text;
  v_entry_id text;
  v_entry_no text;
  v_document_no text;
  v_accepted_quote_count integer;
  v_sale_total numeric(14, 0);
  v_vat_amount numeric(14, 0);
  v_net_revenue numeric(14, 0);
  v_cogs_amount numeric(14, 0);
  v_consumed_document_count integer;
  v_created_entries integer := 0;
  v_skipped_entries integer := 0;
  v_created_receivables integer := 0;
  v_created_allocations integer := 0;
BEGIN
  -- 1. Explicit Parameter & NULL Validation
  IF p_mode IS NULL OR p_mode NOT IN ('post_all', 'post_confirmed_payments', 'recognize_sale') THEN
    RAISE EXCEPTION 'INVALID_ACCOUNTING_MODE: Unsupported accounting posting mode %.', coalesce(p_mode, 'NULL');
  END IF;

  IF p_vat_rate_bps IS NULL OR p_vat_rate_bps < 0 OR p_vat_rate_bps > 10000 THEN
    RAISE EXCEPTION 'INVALID_VAT_RATE: VAT rate must be between 0 and 10000 basis points.';
  END IF;

  IF p_require_consumed_stock IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAMETER: p_require_consumed_stock cannot be null.';
  END IF;

  IF p_order_id IS NULL OR trim(p_order_id) = '' THEN
    RAISE EXCEPTION 'INVALID_PARAMETER: p_order_id cannot be null or empty.';
  END IF;

  IF p_actor_id IS NULL OR trim(p_actor_id) = '' THEN
    RAISE EXCEPTION 'INVALID_PARAMETER: p_actor_id cannot be null or empty.';
  END IF;

  -- 2. Actor Organization & Permission Validation
  SELECT organization_id
  INTO v_actor_org_id
  FROM public.app_users
  WHERE id = p_actor_id
    AND status = 'active';

  IF v_actor_org_id IS NULL THEN
    RAISE EXCEPTION 'Actor is not attached to an internal accounting organization.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = p_actor_id
      AND rp.permission_key IN ('accounting.post', 'system.admin')
  ) THEN
    RAISE EXCEPTION 'Actor is not allowed to post accounting entries.';
  END IF;

  -- 3. Early Entity Lock to Serialize Same-Order Concurrency
  SELECT
    co.id,
    co.order_number,
    co.organization_id AS customer_org_id,
    co.commercial_status,
    co.payment_status,
    co.fulfillment_status,
    co.invoice_requested,
    co.current_quote_version,
    co.created_at,
    co.updated_at,
    org.name AS customer_name
  INTO v_order
  FROM public.customer_orders co
  LEFT JOIN public.organizations org ON org.id = co.organization_id
  WHERE co.id = p_order_id
  FOR UPDATE OF co;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order was not found.';
  END IF;

  -- Cross-Organization Boundary Guard: Actor cannot post accounting for buyer org
  IF v_actor_org_id = v_order.customer_org_id THEN
    RAISE EXCEPTION 'FORBIDDEN_CROSS_ORG: Actor % cannot post accounting for buyer organization %.', p_actor_id, v_order.customer_org_id;
  END IF;

  -- 4. Payment Receipt Posting
  IF p_mode IN ('post_all', 'post_confirmed_payments') THEN
    FOR v_payment IN
      SELECT id, purpose, amount, reference, confirmed_at
      FROM public.payment_requests
      WHERE order_id = p_order_id
        AND status = 'confirmed'
      ORDER BY confirmed_at NULLS LAST, id
    LOOP
      IF coalesce(v_payment.amount, 0) <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Payment amount must be positive for payment %.', v_payment.id;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.journal_entries
        WHERE idempotency_key = concat('payment_receipt:', v_payment.id)
      ) THEN
        v_skipped_entries := v_skipped_entries + 1;
      ELSE
        v_period_id := public.pt_ensure_accounting_period(v_actor_org_id, coalesce(v_payment.confirmed_at::date, current_date));
        v_document_id := gen_random_uuid()::text;
        v_entry_id := gen_random_uuid()::text;

        -- CAST purpose::text to ensure PostgreSQL string function compatibility
        v_document_no := concat('RCPT-', v_order.order_number, '-', upper(v_payment.purpose::text), '-', left(v_payment.id, 8));
        v_entry_no := concat('JE-', v_document_no);

        INSERT INTO public.accounting_documents (
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
        VALUES (
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

        INSERT INTO public.journal_entries (
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
        VALUES (
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

        INSERT INTO public.journal_lines (
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
        VALUES
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

        PERFORM public.post_journal_entry(v_entry_id, p_actor_id);
        v_created_entries := v_created_entries + 1;

        INSERT INTO public.receivable_ledger_entries (
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
        VALUES (
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
        ON CONFLICT (organization_id, source_type, source_id, document_no) DO NOTHING;

        IF found THEN
          v_created_receivables := v_created_receivables + 1;
        END IF;

        INSERT INTO public.payment_allocations (
          id,
          organization_id,
          direction,
          amount,
          payment_request_id,
          allocated_by,
          note
        )
        VALUES (
          gen_random_uuid()::text,
          v_actor_org_id,
          'customer_receipt',
          v_payment.amount,
          v_payment.id,
          p_actor_id,
          concat('Auto allocation for payment ', v_payment.reference)
        )
        ON CONFLICT DO NOTHING;

        IF found THEN
          v_created_allocations := v_created_allocations + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 5. Sale Recognition Posting
  IF p_mode IN ('post_all', 'recognize_sale') THEN
    IF v_order.commercial_status NOT IN ('customer_accepted', 'locked')
      AND v_order.fulfillment_status NOT IN ('packing', 'ready_to_ship', 'shipped', 'delivered') THEN
      RAISE EXCEPTION 'Order must be accepted, locked, packing, shipped, or delivered before sale recognition.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE idempotency_key = concat('sale_recognition:', p_order_id)
    ) THEN
      v_skipped_entries := v_skipped_entries + 1;
    ELSE
      -- 5a. Strict Commercial Snapshot Selection (Fail-Closed Anti-Drift):
      -- ONLY an unambiguous accepted quote version (status = 'accepted' and final_total > 0)
      -- is authoritative for revenue recognition and customer receivable.
      SELECT count(*), coalesce(max(qv.final_total), 0)
      INTO v_accepted_quote_count, v_sale_total
      FROM public.quote_versions qv
      WHERE qv.order_id = p_order_id
        AND qv.status = 'accepted';

      IF v_accepted_quote_count > 1 THEN
        RAISE EXCEPTION 'ACCOUNTING_COMMERCIAL_SNAPSHOT_AMBIGUOUS: Order % has multiple (%) accepted quote versions.', p_order_id, v_accepted_quote_count;
      END IF;

      IF v_accepted_quote_count = 0 OR v_sale_total <= 0 THEN
        RAISE EXCEPTION 'ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING: Order % has no valid accepted commercial quote snapshot with positive final_total.', p_order_id;
      END IF;

      SELECT count(DISTINCT sr.consumed_document_id)
      INTO v_consumed_document_count
      FROM public.stock_reservations sr
      WHERE sr.order_id = p_order_id
        AND sr.organization_id = v_actor_org_id
        AND sr.status = 'consumed';

      -- COGS Override Validation:
      -- If p_require_consumed_stock = false, actor must have explicit override permission
      IF NOT p_require_consumed_stock THEN
        IF NOT EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.role_permissions rp ON rp.role_id = ur.role_id
          WHERE ur.user_id = p_actor_id
            AND rp.permission_key IN ('accounting.override_consumed_stock', 'system.admin')
        ) AND coalesce(v_consumed_document_count, 0) = 0 THEN
          RAISE EXCEPTION 'FORBIDDEN_COGS_OVERRIDE: Actor % is not authorized to bypass consumed stock validation (requires accounting.override_consumed_stock or system.admin).', p_actor_id;
        END IF;
      END IF;

      IF coalesce(v_consumed_document_count, 0) = 0 AND p_require_consumed_stock THEN
        RAISE EXCEPTION 'Cannot recognize sale because order stock reservations have not been consumed.';
      END IF;

      -- COGS validation: fail-closed if any consumed stock movement has missing unit cost
      IF EXISTS (
        SELECT 1
        FROM public.stock_movements sm
        WHERE sm.movement_type = 'sale_out'
          AND sm.document_id IN (
            SELECT DISTINCT sr.consumed_document_id
            FROM public.stock_reservations sr
            WHERE sr.order_id = p_order_id
              AND sr.organization_id = v_actor_org_id
              AND sr.status = 'consumed'
          )
          AND sm.unit_cost IS NULL
      ) THEN
        RAISE EXCEPTION 'ACCOUNTING_COGS_MISSING: One or more consumed stock movements have missing unit cost.';
      END IF;

      SELECT coalesce(sum(-sm.quantity_delta * sm.unit_cost), 0)
      INTO v_cogs_amount
      FROM public.stock_movements sm
      WHERE sm.movement_type = 'sale_out'
        AND sm.document_id IN (
          SELECT DISTINCT sr.consumed_document_id
          FROM public.stock_reservations sr
          WHERE sr.order_id = p_order_id
            AND sr.organization_id = v_actor_org_id
            AND sr.status = 'consumed'
        );

      -- Exact Integer VAT Calculation:
      -- When v_sale_total is VAT-inclusive customer gross total:
      --   VAT = round(v_sale_total * vatRateBps / (10000 + vatRateBps))
      --   NetRevenue = v_sale_total - VAT
      -- Guarantees: NetRevenue + VAT == v_sale_total with zero floating point drift.
      IF p_vat_rate_bps > 0 THEN
        v_vat_amount := round((v_sale_total * p_vat_rate_bps)::numeric / (10000 + p_vat_rate_bps));
        v_net_revenue := v_sale_total - v_vat_amount;
      ELSE
        v_vat_amount := 0;
        v_net_revenue := v_sale_total;
      END IF;

      v_period_id := public.pt_ensure_accounting_period(v_actor_org_id, coalesce(v_order.updated_at::date, current_date));
      v_document_id := gen_random_uuid()::text;
      v_entry_id := gen_random_uuid()::text;
      v_document_no := concat('SALE-', v_order.order_number);
      v_entry_no := concat('JE-', v_document_no);

      INSERT INTO public.accounting_documents (
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
      VALUES (
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

      INSERT INTO public.journal_entries (
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
      VALUES (
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

      INSERT INTO public.journal_lines (
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
      VALUES
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

      IF v_vat_amount > 0 THEN
        INSERT INTO public.journal_lines (
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
        VALUES (
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
      END IF;

      IF v_cogs_amount > 0 THEN
        INSERT INTO public.journal_lines (
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
        VALUES
          (
            gen_random_uuid()::text,
            v_entry_id,
            v_actor_org_id,
            CASE WHEN v_vat_amount > 0 THEN 4 ELSE 3 END,
            '632',
            'Gia von hang ban',
            v_cogs_amount,
            0,
            NULL,
            p_order_id,
            concat('COGS for order ', v_order.order_number)
          ),
          (
            gen_random_uuid()::text,
            v_entry_id,
            v_actor_org_id,
            CASE WHEN v_vat_amount > 0 THEN 5 ELSE 4 END,
            '156',
            'Hang hoa ton kho',
            0,
            v_cogs_amount,
            NULL,
            p_order_id,
            concat('Inventory relief for order ', v_order.order_number)
          );
      END IF;

      PERFORM public.post_journal_entry(v_entry_id, p_actor_id);
      v_created_entries := v_created_entries + 1;

      INSERT INTO public.receivable_ledger_entries (
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
      VALUES (
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
      ON CONFLICT (organization_id, source_type, source_id, document_no) DO NOTHING;

      IF found THEN
        v_created_receivables := v_created_receivables + 1;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'createdEntries', v_created_entries,
    'skippedEntries', v_skipped_entries,
    'createdReceivables', v_created_receivables,
    'createdAllocations', v_created_allocations
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 2. SECURITY DEFINER PRIVILEGE & ACL NORMALIZATION
-- ---------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend_staging') THEN
    GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO pettravel_backend_staging;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend') THEN
    GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO pettravel_backend;
  END IF;
END $$;

COMMIT;
