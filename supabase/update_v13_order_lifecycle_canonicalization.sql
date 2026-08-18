-- ============================================================================
-- PET TRAVEL WHOLESALE — V13 MIGRATION: CANONICAL ORDER LIFECYCLE HARDENING
-- Invariants:
-- 1. Preflight validation for dirty data (active orders, accepted quotes)
-- 2. Schema reconciliation (customer_tax_code, customer_note, variant_image, accepted_at)
-- 3. Auditability (order_revision_history with UNIQUE(order_id, revision_no))
-- 4. Monotonic Real-time Sync (order_sync_revisions)
-- 5. One Active Order per Org (uq_customer_orders_active_org)
-- 6. Exactly One Accepted Quote per Order (uq_quote_versions_single_accepted)
-- 7. Immutability Guards (accepted quotes, quote adjustments, locked order items)
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ── 1. PREFLIGHT SAFETY CHECKS ──────────────────────────────────────────────

-- Check for duplicate active orders per organization
DO $$
DECLARE
  v_dup_orders INT;
BEGIN
  SELECT COUNT(*) INTO v_dup_orders FROM (
    SELECT organization_id
    FROM public.customer_orders
    WHERE commercial_status NOT IN ('cancelled')
      AND fulfillment_status NOT IN ('delivered')
    GROUP BY organization_id
    HAVING COUNT(*) > 1
  ) t;

  IF v_dup_orders > 0 THEN
    RAISE EXCEPTION 'V13_ACTIVE_ORDER_DUPLICATES_FOUND: % organization(s) have multiple active orders.', v_dup_orders;
  END IF;
END;
$$;

-- Check for multiple accepted quotes per order
DO $$
DECLARE
  v_dup_quotes INT;
BEGIN
  SELECT COUNT(*) INTO v_dup_quotes FROM (
    SELECT order_id
    FROM public.quote_versions
    WHERE status = 'accepted'
    GROUP BY order_id
    HAVING COUNT(*) > 1
  ) t;

  IF v_dup_quotes > 0 THEN
    RAISE EXCEPTION 'V13_ACCEPTED_QUOTE_DUPLICATES_FOUND: % order(s) have multiple accepted quotes.', v_dup_quotes;
  END IF;
END;
$$;


-- ── 2. SCHEMA RECONCILIATION ────────────────────────────────────────────────

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS customer_tax_code TEXT,
  ADD COLUMN IF NOT EXISTS customer_note TEXT;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_image TEXT;

ALTER TABLE public.quote_versions
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;


-- ── 3. AUDIT & MONOTONIC REALTIME SYNC TABLES ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_revision_history (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  order_id TEXT NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES public.app_users(id),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action_type TEXT NOT NULL,
  from_commercial_status TEXT NOT NULL,
  to_commercial_status TEXT NOT NULL,
  items_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
  quote_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
  shipping_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_order_revision_no UNIQUE (order_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_order_revision_history_order_rev
  ON public.order_revision_history (order_id, revision_no DESC);

CREATE TABLE IF NOT EXISTS public.order_sync_revisions (
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope_type, scope_id)
);


-- ── 4. CONCURRENCY & UNIQUENESS HARD CONSTRAINTS ────────────────────────────

-- Single Active Order per Organization
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_orders_active_org
  ON public.customer_orders (organization_id)
  WHERE commercial_status NOT IN ('cancelled')
    AND fulfillment_status NOT IN ('delivered');

-- Exactly One Accepted Quote per Order
CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_versions_single_accepted
  ON public.quote_versions (order_id)
  WHERE status = 'accepted';


-- ── 5. IMMUTABILITY TRIGGERS ────────────────────────────────────────────────

-- A. Guard Accepted Quote Immutability
CREATE OR REPLACE FUNCTION public.pt_guard_accepted_quote_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'accepted' THEN
      RAISE EXCEPTION 'ACCEPTED_QUOTE_IMMUTABLE: Cannot delete an accepted quote version (id: %).', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'accepted' THEN
      IF NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'ACCEPTED_QUOTE_IMMUTABLE: Cannot modify commercial snapshot of accepted quote version (id: %).', OLD.id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_accepted_quote_immutability ON public.quote_versions;
CREATE TRIGGER trg_guard_accepted_quote_immutability
BEFORE UPDATE OR DELETE ON public.quote_versions
FOR EACH ROW EXECUTE FUNCTION public.pt_guard_accepted_quote_immutability();


-- B. Guard Accepted Quote Adjustments Immutability
CREATE OR REPLACE FUNCTION public.pt_guard_accepted_adjustment_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quote_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO v_quote_status FROM public.quote_versions WHERE id = NEW.quote_id;
    IF v_quote_status = 'accepted' THEN
      RAISE EXCEPTION 'ACCEPTED_QUOTE_ADJUSTMENT_IMMUTABLE: Cannot add adjustments to an accepted quote version (quote_id: %).', NEW.quote_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO v_quote_status FROM public.quote_versions WHERE id = OLD.quote_id;
    IF v_quote_status = 'accepted' THEN
      RAISE EXCEPTION 'ACCEPTED_QUOTE_ADJUSTMENT_IMMUTABLE: Cannot modify adjustments of an accepted quote version (quote_id: %).', OLD.quote_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_quote_status FROM public.quote_versions WHERE id = OLD.quote_id;
    IF v_quote_status = 'accepted' THEN
      RAISE EXCEPTION 'ACCEPTED_QUOTE_ADJUSTMENT_IMMUTABLE: Cannot delete adjustments from an accepted quote version (quote_id: %).', OLD.quote_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_accepted_adjustment_immutability ON public.quote_adjustments;
CREATE TRIGGER trg_guard_accepted_adjustment_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.quote_adjustments
FOR EACH ROW EXECUTE FUNCTION public.pt_guard_accepted_adjustment_immutability();


-- C. Guard Locked Order Items Immutability
CREATE OR REPLACE FUNCTION public.pt_guard_locked_order_item_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked = true THEN
      RAISE EXCEPTION 'LOCKED_ITEM_IMMUTABLE: Cannot delete locked order item (id: %).', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.locked = true THEN
      IF NEW.product_code_snapshot <> OLD.product_code_snapshot
         OR NEW.product_name_snapshot <> OLD.product_name_snapshot
         OR NEW.variant_sku_snapshot <> OLD.variant_sku_snapshot
         OR NEW.variant_label_snapshot <> OLD.variant_label_snapshot
         OR NEW.supplier_id <> OLD.supplier_id
         OR NEW.quantity <> OLD.quantity
         OR NEW.unit_price_snapshot <> OLD.unit_price_snapshot
         OR NEW.order_id <> OLD.order_id THEN
        RAISE EXCEPTION 'LOCKED_ITEM_IMMUTABLE: Cannot modify commercial fields of locked order item (id: %).', OLD.id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_locked_order_item_immutability ON public.order_items;
CREATE TRIGGER trg_guard_locked_order_item_immutability
BEFORE UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.pt_guard_locked_order_item_immutability();

REVOKE EXECUTE ON FUNCTION public.pt_guard_accepted_quote_immutability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pt_guard_accepted_adjustment_immutability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pt_guard_locked_order_item_immutability() FROM PUBLIC, anon, authenticated;

COMMIT;
