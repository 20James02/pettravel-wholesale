-- =====================================================================
-- PET TRAVEL WHOLESALE — V13 ORDER LIFECYCLE CANONICALIZATION & HARDENING
-- =====================================================================
-- Target: Forward migration on top of immutable V10, V11, V12
-- Purpose: Enforce authoritative canonical order lifecycle, commercial SOT,
--          concurrency invariants, and database defense-in-depth:
--          1. Schema reconciliation for customer_tax_code, customer_note,
--             variant_image, and quote_versions.accepted_at.
--          2. Monotonic audit log with UNIQUE(order_id, revision_no).
--          3. Monotonic real-time sync table (order_sync_revisions).
--          4. Concurrency invariant: One active order per organization.
--          5. PostgreSQL triggers for accepted quote & adjustment immutability.
--          6. Zero-trust ACLs & SECURITY DEFINER standards.
-- =====================================================================

BEGIN;

-- Session timeouts prevent indefinite lock queueing
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ---------------------------------------------------------------------
-- 1. SCHEMA RECONCILIATION FOR CANONICAL ORDER & ITEM ATTRIBUTES
-- ---------------------------------------------------------------------

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS customer_tax_code text,
  ADD COLUMN IF NOT EXISTS customer_note text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_image text;

ALTER TABLE public.quote_versions
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. MONOTONIC ORDER REVISION HISTORY WITH UNIQUE CONSTRAINT
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_revision_history (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id text NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  revision_no integer NOT NULL,
  actor_id text NOT NULL REFERENCES public.app_users(id),
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action_type text NOT NULL,
  from_commercial_status text NOT NULL,
  to_commercial_status text NOT NULL,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  shipping_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_revision UNIQUE (order_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_order_revision_history_order_rev
  ON public.order_revision_history (order_id, revision_no DESC);

-- ---------------------------------------------------------------------
-- 3. MONOTONIC REAL-TIME SYNC REVISION TRACKING (NO TOP-50 BLIND SPOT)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_sync_revisions (
  scope_type text NOT NULL, -- 'global' | 'organization'
  scope_id text NOT NULL,   -- 'global' | org_id
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_type, scope_id)
);

-- Seed global sync row if not exists
INSERT INTO public.order_sync_revisions (scope_type, scope_id, revision, updated_at)
VALUES ('global', 'global', 1, now())
ON CONFLICT (scope_type, scope_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. CONCURRENCY INVARIANT: ONE ACTIVE ORDER PER ORGANIZATION
-- ---------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_orders_active_org
  ON public.customer_orders (organization_id)
  WHERE commercial_status NOT IN ('cancelled') AND fulfillment_status NOT IN ('delivered');

CREATE INDEX IF NOT EXISTS idx_customer_orders_org_updated
  ON public.customer_orders (organization_id, updated_at DESC, id DESC);

-- ---------------------------------------------------------------------
-- 5. IMMUTABILITY GUARDS FOR ACCEPTED QUOTE SNAPSHOTS & ADJUSTMENTS
-- ---------------------------------------------------------------------

-- Guard: Prevent mutation or deletion of accepted quote versions
CREATE OR REPLACE FUNCTION public.pt_guard_accepted_quote_immutability()
RETURNS trigger
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
      -- Strict commercial snapshot immutability check
      IF NEW.subtotal <> OLD.subtotal
         OR NEW.final_total <> OLD.final_total
         OR NEW.deposit_amount <> OLD.deposit_amount
         OR NEW.cod_remaining <> OLD.cod_remaining
         OR NEW.expires_at <> OLD.expires_at
         OR NEW.version <> OLD.version
         OR NEW.order_id <> OLD.order_id THEN
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
FOR EACH ROW
EXECUTE FUNCTION public.pt_guard_accepted_quote_immutability();

-- Guard: Prevent mutation of adjustments belonging to accepted quotes
CREATE OR REPLACE FUNCTION public.pt_guard_accepted_adjustment_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quote_status text;
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
FOR EACH ROW
EXECUTE FUNCTION public.pt_guard_accepted_adjustment_immutability();

-- ---------------------------------------------------------------------
-- 6. SECURITY DEFINER PRIVILEGE & ACL NORMALIZATION
-- ---------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.pt_guard_accepted_quote_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pt_guard_accepted_adjustment_immutability() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE public.order_revision_history TO service_role;
    GRANT ALL ON TABLE public.order_sync_revisions TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend_staging') THEN
    GRANT ALL ON TABLE public.order_revision_history TO pettravel_backend_staging;
    GRANT ALL ON TABLE public.order_sync_revisions TO pettravel_backend_staging;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pettravel_backend') THEN
    GRANT ALL ON TABLE public.order_revision_history TO pettravel_backend;
    GRANT ALL ON TABLE public.order_sync_revisions TO pettravel_backend;
  END IF;
END $$;

COMMIT;
