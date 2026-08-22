-- Remove the production E2E order fixtures that were accidentally persisted
-- in the Hanh Phuc organization. Every guard is intentionally exact so this
-- maintenance script aborts if the target set changes.

BEGIN;

DO $cleanup_guard$
DECLARE
  target_count INTEGER;
BEGIN
  SELECT count(*)
    INTO target_count
  FROM public.customer_orders
  WHERE id LIKE 'ord_e2e_%'
    AND organization_id = 'org_eafeb31c56bf4e3bbbb08361ec4bf963'
    AND created_by = 'u_08567c214f3e487b83991038dfbcb7e6';

  IF target_count <> 8 THEN
    RAISE EXCEPTION 'E2E cleanup aborted: expected 8 orders, found %', target_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_lines jl
    JOIN public.customer_orders co ON co.id = jl.order_id
    WHERE co.id LIKE 'ord_e2e_%'
      AND co.organization_id = 'org_eafeb31c56bf4e3bbbb08361ec4bf963'
      AND co.created_by = 'u_08567c214f3e487b83991038dfbcb7e6'
  ) THEN
    RAISE EXCEPTION 'E2E cleanup aborted: accounting journal lines exist';
  END IF;
END
$cleanup_guard$;

-- Accepted commercial snapshots are immutable in normal workflows. Disable
-- only the DELETE guards in this transaction for the exact maintenance set.
-- PostgreSQL rolls these ALTER statements back automatically if any step fails.
ALTER TABLE public.order_items
  DISABLE TRIGGER trg_guard_locked_order_item_immutability;
ALTER TABLE public.quote_adjustments
  DISABLE TRIGGER trg_guard_accepted_adjustment_immutability;
ALTER TABLE public.quote_versions
  DISABLE TRIGGER trg_guard_accepted_quote_immutability;
ALTER TABLE public.stock_reservations
  DISABLE TRIGGER trg_protect_consumed_stock_reservation;

DELETE FROM public.customer_orders
WHERE id LIKE 'ord_e2e_%'
  AND organization_id = 'org_eafeb31c56bf4e3bbbb08361ec4bf963'
  AND created_by = 'u_08567c214f3e487b83991038dfbcb7e6';

DO $cleanup_verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.customer_orders
    WHERE id LIKE 'ord_e2e_%'
      AND organization_id = 'org_eafeb31c56bf4e3bbbb08361ec4bf963'
      AND created_by = 'u_08567c214f3e487b83991038dfbcb7e6'
  ) THEN
    RAISE EXCEPTION 'E2E cleanup verification failed';
  END IF;
END
$cleanup_verify$;

ALTER TABLE public.order_items
  ENABLE TRIGGER trg_guard_locked_order_item_immutability;
ALTER TABLE public.quote_adjustments
  ENABLE TRIGGER trg_guard_accepted_adjustment_immutability;
ALTER TABLE public.quote_versions
  ENABLE TRIGGER trg_guard_accepted_quote_immutability;
ALTER TABLE public.stock_reservations
  ENABLE TRIGGER trg_protect_consumed_stock_reservation;

COMMIT;
