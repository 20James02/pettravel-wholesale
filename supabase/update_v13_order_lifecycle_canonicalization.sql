-- ============================================================================
-- PET TRAVEL WHOLESALE — V13 MIGRATION: CANONICAL ORDER LIFECYCLE HARDENING
-- Invariants:
-- 1. Preflight validation for dirty data (active orders, accepted quotes, revision duplicates)
-- 2. Schema reconciliation (customer_tax_code, customer_note, variant_image, accepted_at)
-- 3. Auditability (order_revision_history with explicit UNIQUE(order_id, revision_no) reconciliation)
-- 4. Monotonic Real-time Sync (order_sync_revisions)
-- 5. One Active Order per Org (uq_customer_orders_active_org with drift detection)
-- 6. Exactly One Accepted Quote per Order (uq_quote_versions_single_accepted with drift detection)
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

-- Check for duplicate revision_no if order_revision_history already exists
DO $$
DECLARE
  v_dup_revs INT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_revision_history') THEN
    SELECT COUNT(*) INTO v_dup_revs FROM (
      SELECT order_id, revision_no
      FROM public.order_revision_history
      GROUP BY order_id, revision_no
      HAVING COUNT(*) > 1
    ) t;

    IF v_dup_revs > 0 THEN
      RAISE EXCEPTION 'V13_REVISION_DUPLICATES_FOUND: Duplicate revision_no found in order_revision_history (% duplicates).', v_dup_revs;
    END IF;
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Explicit constraint reconciliation for uq_order_revision_no
DO $$
DECLARE
  v_dup_revs INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_order_revision_no'
      AND conrelid = 'public.order_revision_history'::regclass
  ) THEN
    -- Check duplicate rows before applying unique constraint
    SELECT COUNT(*) INTO v_dup_revs FROM (
      SELECT order_id, revision_no
      FROM public.order_revision_history
      GROUP BY order_id, revision_no
      HAVING COUNT(*) > 1
    ) t;

    IF v_dup_revs > 0 THEN
      RAISE EXCEPTION 'V13_REVISION_DUPLICATES_FOUND: Duplicate revision_no found in order_revision_history (% duplicates).', v_dup_revs;
    END IF;

    ALTER TABLE public.order_revision_history
      ADD CONSTRAINT uq_order_revision_no UNIQUE (order_id, revision_no);
  END IF;
END;
$$;

-- Index with drift detection for idx_order_revision_history_order_rev
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_indexdef(c.oid) INTO v_def
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'idx_order_revision_history_order_rev';

  IF v_def IS NOT NULL THEN
    IF v_def NOT LIKE '%order_id%' OR v_def NOT LIKE '%revision_no%' THEN
      RAISE EXCEPTION 'V13_SCHEMA_DRIFT_DETECTED: Index idx_order_revision_history_order_rev exists with incompatible definition: %', v_def;
    END IF;
  ELSE
    CREATE INDEX idx_order_revision_history_order_rev
      ON public.order_revision_history (order_id, revision_no DESC);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.order_sync_revisions (
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope_type, scope_id)
);

-- Defense in depth for any direct Supabase/PostgREST access. The service role
-- used by the BFF/backend continues to bypass RLS and performs its own checks.
ALTER TABLE public.order_revision_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_sync_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers can read own order revision history" ON public.order_revision_history;
CREATE POLICY "customers can read own order revision history"
  ON public.order_revision_history FOR SELECT
  USING (
    public.current_app_user_has_role(ARRAY['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
    OR EXISTS (
      SELECT 1
      FROM public.customer_orders o
      WHERE o.id = order_revision_history.order_id
        AND o.organization_id = public.current_app_user_org_id()
    )
  );

DROP POLICY IF EXISTS "users can read scoped order sync revisions" ON public.order_sync_revisions;
CREATE POLICY "users can read scoped order sync revisions"
  ON public.order_sync_revisions FOR SELECT
  USING (
    public.current_app_user_has_role(ARRAY['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
    OR (scope_type = 'organization' AND scope_id = public.current_app_user_org_id())
  );


-- ── 4. CONCURRENCY & UNIQUENESS HARD CONSTRAINTS WITH DRIFT DETECTION ───────

-- Single Active Order per Organization
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_indexdef(c.oid) INTO v_def
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'uq_customer_orders_active_org';

  IF v_def IS NOT NULL THEN
    IF v_def NOT LIKE '%organization_id%' OR v_def NOT LIKE '%commercial_status%' OR v_def NOT LIKE '%fulfillment_status%' THEN
      RAISE EXCEPTION 'V13_SCHEMA_DRIFT_DETECTED: Index uq_customer_orders_active_org exists with incompatible definition: %', v_def;
    END IF;
  ELSE
    CREATE UNIQUE INDEX uq_customer_orders_active_org
      ON public.customer_orders (organization_id)
      WHERE commercial_status NOT IN ('cancelled')
        AND fulfillment_status NOT IN ('delivered');
  END IF;
END;
$$;

-- Exactly One Accepted Quote per Order
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_indexdef(c.oid) INTO v_def
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'uq_quote_versions_single_accepted';

  IF v_def IS NOT NULL THEN
    IF v_def NOT LIKE '%order_id%' OR v_def NOT LIKE '%accepted%' THEN
      RAISE EXCEPTION 'V13_SCHEMA_DRIFT_DETECTED: Index uq_quote_versions_single_accepted exists with incompatible definition: %', v_def;
    END IF;
  ELSE
    CREATE UNIQUE INDEX uq_quote_versions_single_accepted
      ON public.quote_versions (order_id)
      WHERE status = 'accepted';
  END IF;
END;
$$;


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
  v_new_quote_status TEXT;
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
    SELECT status INTO v_new_quote_status FROM public.quote_versions WHERE id = NEW.quote_id;
    IF v_new_quote_status = 'accepted' THEN
      RAISE EXCEPTION 'ACCEPTED_QUOTE_ADJUSTMENT_IMMUTABLE: Cannot move adjustments onto an accepted quote version (quote_id: %).', NEW.quote_id;
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
