-- =====================================================================
-- PET TRAVEL WHOLESALE — EMERGENCY V11 FORWARD REPAIR / ROLLBACK SCRIPT
-- =====================================================================
-- Target: Atomically restore known-good procedure definitions for:
--   1. public.pt_reserve_order_stock(text, text, timestamptz)
--   2. public.pt_post_order_accounting(text, text, text, integer, boolean)
--
-- Security Invariants Retained During Rollback:
--   - SECURITY DEFINER
--   - SET search_path = '' (empty search path prevents object hijacking)
--   - Schema-qualified public.* objects
--   - REVOKE ALL from PUBLIC, anon, authenticated (prevents PostgREST Confused Deputy)
--   - GRANT EXECUTE to service_role, pettravel_backend_staging, pettravel_backend
--   - Balanced General Ledger entries (Debit == Credit)
--   - Fail-closed accounting snapshot & COGS protection
--
-- Zero Data Loss:
--   - No tables, columns, or data are dropped, altered, or deleted.
-- =====================================================================

BEGIN;

-- Set local statement and lock timeouts to avoid waiting behind long transactions
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ---------------------------------------------------------------------
-- 1. RESTORE: public.pt_reserve_order_stock
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pt_reserve_order_stock(
  p_order_id text,
  p_actor_id text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order record;
  v_item record;
  v_balance record;
  v_inventory_org_id text;
  v_existing_qty integer;
  v_reserved_qty integer := 0;
  v_line_count integer := 0;
BEGIN
  -- Parameter validation
  IF p_order_id IS NULL OR trim(p_order_id) = '' THEN
    RAISE EXCEPTION 'INVALID_PARAMETER: p_order_id cannot be null or empty.';
  END IF;

  IF p_actor_id IS NULL OR trim(p_actor_id) = '' THEN
    RAISE EXCEPTION 'INVALID_PARAMETER: p_actor_id cannot be null or empty.';
  END IF;

  -- Early row-level lock on customer_orders
  SELECT id, organization_id, commercial_status
  INTO v_order
  FROM public.customer_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order was not found.';
  END IF;

  IF v_order.commercial_status NOT IN ('customer_accepted', 'locked') THEN
    RAISE EXCEPTION 'Only accepted or locked orders can reserve stock.';
  END IF;

  -- Actor validation
  SELECT organization_id
  INTO v_inventory_org_id
  FROM public.app_users
  WHERE id = p_actor_id
    AND status = 'active';

  IF v_inventory_org_id IS NULL THEN
    RAISE EXCEPTION 'Actor is not attached to an internal inventory organization.';
  END IF;

  -- Cross-organization isolation
  IF v_inventory_org_id = v_order.organization_id THEN
    RAISE EXCEPTION 'FORBIDDEN_CROSS_ORG: Actor % cannot reserve stock for customer buyer organization %.', p_actor_id, v_order.organization_id;
  END IF;

  -- Permission check
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = p_actor_id
      AND rp.permission_key IN ('operations.write', 'operations.post', 'order.quote', 'order.adjust')
  ) THEN
    RAISE EXCEPTION 'Actor is not allowed to reserve stock.';
  END IF;

  -- Idempotency check under lock
  SELECT coalesce(sum(quantity), 0)
  INTO v_existing_qty
  FROM public.stock_reservations
  WHERE order_id = p_order_id
    AND organization_id = v_inventory_org_id
    AND status = 'active';

  IF v_existing_qty > 0 THEN
    RETURN jsonb_build_object(
      'status', 'already_reserved',
      'reservedQty', v_existing_qty,
      'lineCount', (
        SELECT count(*)
        FROM public.stock_reservations
        WHERE order_id = p_order_id
          AND organization_id = v_inventory_org_id
          AND status = 'active'
      )
    );
  END IF;

  -- Deterministic multi-SKU lock ordering
  FOR v_item IN
    SELECT id, variant_sku_snapshot, quantity
    FROM public.order_items
    WHERE order_id = p_order_id
    ORDER BY variant_sku_snapshot, id
  LOOP
    SELECT ib.*
    INTO v_balance
    FROM public.inventory_balances ib
    LEFT JOIN public.warehouses w ON w.id = ib.warehouse_id
    WHERE ib.organization_id = v_inventory_org_id
      AND ib.sku = v_item.variant_sku_snapshot
      AND (ib.on_hand_qty - ib.reserved_qty - ib.defective_qty) >= v_item.quantity
    ORDER BY coalesce(w.is_default, false) DESC, ib.updated_at DESC, ib.id ASC
    LIMIT 1
    FOR UPDATE OF ib;

    IF v_balance.id IS NULL THEN
      RAISE EXCEPTION 'Available stock is not enough for SKU %.', v_item.variant_sku_snapshot;
    END IF;

    UPDATE public.inventory_balances
    SET reserved_qty = reserved_qty + v_item.quantity,
        updated_at = now()
    WHERE id = v_balance.id;

    INSERT INTO public.stock_reservations (
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
    VALUES (
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
  END LOOP;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Order has no items to reserve.';
  END IF;

  RETURN jsonb_build_object('status', 'reserved', 'reservedQty', v_reserved_qty, 'lineCount', v_line_count);
END;
$$;

-- ---------------------------------------------------------------------
-- 2. RESTORE: public.pt_post_order_accounting
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
  -- Parameter validation
  IF p_mode IS NULL OR p_mode NOT IN ('post_all', 'post_confirmed_payments', 'recognize_sale') THEN
    RAISE EXCEPTION 'INVALID_ACCOUNTING_MODE: Unsupported accounting posting mode %.', coalesce(p_mode, 'NULL');
  END IF;

  IF p_vat_rate_bps IS NULL OR p_vat_rate_bps < 0 OR p_vat_rate_bps > 10000 THEN
    RAISE EXCEPTION 'INVALID_VAT_RATE: VAT rate must be between 0 and 10000 basis points.';
  END IF;

  IF p_require_consumed_stock IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAMETER: p_require_consumed_stock cannot be null.';
  END IF;

  -- Actor validation
  SELECT organization_id
  INTO v_actor_org_id
  FROM public.app_users
  WHERE id = p_actor_id
    AND status = 'active';

  IF v_actor_org_id IS NULL THEN
    RAISE EXCEPTION 'Actor is not active.';
  END IF;

  -- Role permission check
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = p_actor_id
      AND rp.permission_key IN ('accounting.post', 'system.admin')
  ) THEN
    RAISE EXCEPTION 'Actor is not allowed to post accounting.';
  END IF;

  -- Order lock
  SELECT co.id,
         co.organization_id AS customer_org_id,
         co.order_number,
         co.commercial_status,
         co.current_quote_version,
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

  -- Cross-organization guard
  IF v_actor_org_id = v_order.customer_org_id THEN
    RAISE EXCEPTION 'FORBIDDEN_CROSS_ORG: Actor % cannot post accounting for buyer organization %.', p_actor_id, v_order.customer_org_id;
  END IF;

  -- Payment Receipt Posting
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

        v_document_no := concat('RCPT-', v_order.order_number, '-', upper(v_payment.purpose::text), '-', left(v_payment.id, 8));
        v_entry_no := concat('JE-', v_document_no);

        INSERT INTO public.accounting_documents (
          id, organization_id, source_type, source_id, document_no, document_date, status, total_amount, created_by
        )
        VALUES (
          v_document_id, v_actor_org_id, 'payment_request', v_payment.id, v_document_no, coalesce(v_payment.confirmed_at::date, current_date), 'posted', v_payment.amount, p_actor_id
        );

        INSERT INTO public.journal_entries (
          id, organization_id, period_id, document_id, source_type, source_id, entry_no, description, status, idempotency_key, created_by
        )
        VALUES (
          v_entry_id, v_actor_org_id, v_period_id, v_document_id, 'payment_request', v_payment.id, v_entry_no, concat('Confirm payment ', v_payment.reference, ' for order ', v_order.order_number), 'draft', concat('payment_receipt:', v_payment.id), p_actor_id
        );

        INSERT INTO public.journal_lines (
          id, entry_id, organization_id, line_no, account_code, account_name, debit_amount, credit_amount, partner_org_id, order_id, memo
        )
        VALUES
          (gen_random_uuid()::text, v_entry_id, v_actor_org_id, 1, '1121', 'Tien gui ngan hang VND', v_payment.amount, 0, v_order.customer_org_id, p_order_id, v_payment.reference),
          (gen_random_uuid()::text, v_entry_id, v_actor_org_id, 2, '131', 'Phai thu cua khach hang', 0, v_payment.amount, v_order.customer_org_id, p_order_id, v_payment.reference);

        PERFORM public.post_journal_entry(v_entry_id, p_actor_id);
        v_created_entries := v_created_entries + 1;

        INSERT INTO public.receivable_ledger_entries (
          id, organization_id, customer_org_id, customer_name, source_type, source_id, document_no, document_date, credit_amount, status, note, created_by
        )
        VALUES (
          gen_random_uuid()::text, v_actor_org_id, v_order.customer_org_id, coalesce(v_order.customer_name, 'Unknown customer'), 'payment_request', v_payment.id, v_document_no, coalesce(v_payment.confirmed_at::date, current_date), v_payment.amount, 'open', concat('Auto credit receivable from confirmed payment ', v_payment.reference), p_actor_id
        )
        ON CONFLICT (organization_id, source_type, source_id, document_no) DO NOTHING;

        IF FOUND THEN
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

        IF FOUND THEN
          v_created_allocations := v_created_allocations + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Sale Recognition Posting
  IF p_mode IN ('post_all', 'recognize_sale') THEN
    IF EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE idempotency_key = concat('sale_recognition:', p_order_id)
    ) THEN
      v_skipped_entries := v_skipped_entries + 1;
    ELSE
      -- Accepted quote priority
      SELECT qv.final_total
      INTO v_sale_total
      FROM public.quote_versions qv
      WHERE qv.order_id = p_order_id
        AND qv.status = 'accepted'
      ORDER BY qv.version DESC
      LIMIT 1;

      -- Current locked/accepted fallback
      IF v_sale_total IS NULL OR v_sale_total <= 0 THEN
        SELECT qv.final_total
        INTO v_sale_total
        FROM public.quote_versions qv
        WHERE qv.order_id = p_order_id
          AND qv.version = v_order.current_quote_version
          AND qv.status IN ('accepted', 'published')
          AND v_order.commercial_status IN ('customer_accepted', 'locked', 'deposit_confirmed', 'payment_confirmed', 'completed');
      END IF;

      -- Order items fallback if no quote versions exist
      IF v_sale_total IS NULL OR v_sale_total <= 0 THEN
        IF NOT EXISTS (SELECT 1 FROM public.quote_versions WHERE order_id = p_order_id) THEN
          SELECT coalesce(sum(quantity * unit_price_snapshot), 0)
          INTO v_sale_total
          FROM public.order_items
          WHERE order_id = p_order_id;
        END IF;
      END IF;

      -- Fail closed
      IF v_sale_total IS NULL OR v_sale_total <= 0 THEN
        RAISE EXCEPTION 'ACCOUNTING_COMMERCIAL_SNAPSHOT_MISSING: Order % has no valid accepted or locked commercial quote snapshot.', p_order_id;
      END IF;

      SELECT count(DISTINCT sr.consumed_document_id)
      INTO v_consumed_document_count
      FROM public.stock_reservations sr
      WHERE sr.order_id = p_order_id
        AND sr.organization_id = v_actor_org_id
        AND sr.status = 'consumed';

      -- COGS Override validation
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

      -- COGS fail-closed check
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

      -- Exact Integer VAT math
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
        id, organization_id, source_type, source_id, document_no, document_date, status, total_amount, created_by
      )
      VALUES (
        v_document_id, v_actor_org_id, 'customer_order', v_order.id, v_document_no, coalesce(v_order.updated_at::date, current_date), 'posted', v_sale_total, p_actor_id
      );

      INSERT INTO public.journal_entries (
        id, organization_id, period_id, document_id, source_type, source_id, entry_no, description, status, idempotency_key, created_by
      )
      VALUES (
        v_entry_id, v_actor_org_id, v_period_id, v_document_id, 'customer_order', v_order.id, v_entry_no, concat('Recognize sale for order ', v_order.order_number), 'draft', concat('sale_recognition:', p_order_id), p_actor_id
      );

      -- Balanced journal lines
      IF v_vat_amount > 0 THEN
        INSERT INTO public.journal_lines (
          id, entry_id, organization_id, line_no, account_code, account_name, debit_amount, credit_amount, partner_org_id, order_id, memo
        )
        VALUES
          (gen_random_uuid()::text, v_entry_id, v_actor_org_id, 1, '131', 'Phai thu cua khach hang', v_sale_total, 0, v_order.customer_org_id, p_order_id, concat('Gross receivable for order ', v_order.order_number)),
          (gen_random_uuid()::text, v_entry_id, v_actor_org_id, 2, '5111', 'Doanh thu ban hang hoa', 0, v_net_revenue, v_order.customer_org_id, p_order_id, concat('Net revenue for order ', v_order.order_number)),
          (gen_random_uuid()::text, v_entry_id, v_actor_org_id, 3, '33311', 'Thue GTGT phai nop', 0, v_vat_amount, v_order.customer_org_id, p_order_id, concat('Output VAT for order ', v_order.order_number));
      ELSE
        INSERT INTO public.journal_lines (
          id, entry_id, organization_id, line_no, account_code, account_name, debit_amount, credit_amount, partner_org_id, order_id, memo
        )
        VALUES
          (gen_random_uuid()::text, v_entry_id, v_actor_org_id, 1, '131', 'Phai thu cua khach hang', v_sale_total, 0, v_order.customer_org_id, p_order_id, concat('Receivable for order ', v_order.order_number)),
          (gen_random_uuid()::text, v_entry_id, v_actor_org_id, 2, '5111', 'Doanh thu ban hang hoa', 0, v_sale_total, v_order.customer_org_id, p_order_id, concat('Revenue for order ', v_order.order_number));
      END IF;

      IF v_cogs_amount > 0 THEN
        INSERT INTO public.journal_lines (
          id, entry_id, organization_id, line_no, account_code, account_name, debit_amount, credit_amount, partner_org_id, order_id, memo
        )
        VALUES
          (gen_random_uuid()::text, v_entry_id, v_actor_org_id, CASE WHEN v_vat_amount > 0 THEN 4 ELSE 3 END, '632', 'Gia von hang ban', v_cogs_amount, 0, NULL, p_order_id, concat('COGS for order ', v_order.order_number)),
          (gen_random_uuid()::text, v_entry_id, v_actor_org_id, CASE WHEN v_vat_amount > 0 THEN 5 ELSE 4 END, '156', 'Hang hoa ton kho', 0, v_cogs_amount, NULL, p_order_id, concat('Inventory relief for order ', v_order.order_number));
      END IF;

      PERFORM public.post_journal_entry(v_entry_id, p_actor_id);
      v_created_entries := v_created_entries + 1;

      INSERT INTO public.receivable_ledger_entries (
        id, organization_id, customer_org_id, customer_name, source_type, source_id, document_no, document_date, debit_amount, status, note, created_by
      )
      VALUES (
        gen_random_uuid()::text, v_actor_org_id, v_order.customer_org_id, coalesce(v_order.customer_name, 'Unknown customer'), 'order', v_order.id, concat('SALE-', v_order.order_number), coalesce(v_order.updated_at::date, current_date), v_sale_total, 'open', concat('Auto debit receivable from sale recognition of order ', v_order.order_number), p_actor_id
      )
      ON CONFLICT (organization_id, source_type, source_id, document_no) DO NOTHING;

      IF FOUND THEN
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
-- 3. ACL NORMALIZATION & LEAST-PRIVILEGE GRANTS
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) TO service_role;
    GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend_staging') THEN
    GRANT EXECUTE ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) TO pettravel_backend_staging;
    GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO pettravel_backend_staging;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend') THEN
    GRANT EXECUTE ON FUNCTION public.pt_reserve_order_stock(text, text, timestamptz) TO pettravel_backend;
    GRANT EXECUTE ON FUNCTION public.pt_post_order_accounting(text, text, text, integer, boolean) TO pettravel_backend;
  END IF;
END $$;

COMMIT;
