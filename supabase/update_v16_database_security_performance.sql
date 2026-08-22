-- V16: Supabase advisor hardening for least privilege, deterministic RLS,
-- fixed function search paths, and foreign-key lookup coverage.
-- Idempotent and safe to re-apply.

BEGIN;

-- Identity helpers are required by authenticated RLS policies, but anonymous
-- callers must not be able to enumerate their SECURITY DEFINER behavior.
REVOKE EXECUTE ON FUNCTION public.current_app_user_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_app_user_org_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_app_user_has_role(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_user_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_user_has_role(TEXT[]) TO authenticated, service_role;

-- Accounting and stock-transition functions are backend-only. Direct database
-- owners retain access; service_role is the only PostgREST role allowed here.
REVOKE EXECUTE ON FUNCTION public.assert_journal_entry_balanced(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_journal_entry(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_journal_entry_balanced(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.pt_transition_order_stock_reservations(text,text,text,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.pt_transition_order_stock_reservations(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.pt_transition_order_stock_reservations(TEXT, TEXT, TEXT, TEXT) TO service_role;
  END IF;
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
  END IF;
END;
$$;

-- Trigger functions never need direct API execution. A fixed search_path also
-- prevents role-controlled object resolution and clears advisor warnings.
ALTER FUNCTION public.protect_confirmed_payments() SET search_path = pg_catalog, public;
ALTER FUNCTION public.on_quote_published() SET search_path = pg_catalog, public;
ALTER FUNCTION public.protect_posted_journal_entry() SET search_path = pg_catalog, public;
ALTER FUNCTION public.protect_posted_journal_lines() SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION public.protect_confirmed_payments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_quote_published() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_posted_journal_entry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_posted_journal_lines() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.protect_posted_operations_document()') IS NOT NULL THEN
    ALTER FUNCTION public.protect_posted_operations_document() SET search_path = pg_catalog, public;
    REVOKE EXECUTE ON FUNCTION public.protect_posted_operations_document() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.protect_consumed_stock_reservation()') IS NOT NULL THEN
    ALTER FUNCTION public.protect_consumed_stock_reservation() SET search_path = pg_catalog, public;
    REVOKE EXECUTE ON FUNCTION public.protect_consumed_stock_reservation() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.protect_closed_reconciliation_batch()') IS NOT NULL THEN
    ALTER FUNCTION public.protect_closed_reconciliation_batch() SET search_path = pg_catalog, public;
    REVOKE EXECUTE ON FUNCTION public.protect_closed_reconciliation_batch() FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

-- Make the auth calls init-plan constants instead of evaluating them per row.
DROP POLICY IF EXISTS "users can read own profile" ON public.app_users;
CREATE POLICY "users can read own profile"
  ON public.app_users FOR SELECT
  USING (
    (SELECT auth.uid()) = auth_user_id
    OR public.current_app_user_has_role(ARRAY['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
  );

DROP POLICY IF EXISTS "customers can read own organization orders" ON public.customer_orders;
CREATE POLICY "customers can read own organization orders"
  ON public.customer_orders FOR SELECT
  USING (
    public.current_app_user_has_role(ARRAY['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
    OR EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = (SELECT auth.uid())
        AND u.organization_id = customer_orders.organization_id
    )
  );

DROP POLICY IF EXISTS "customers can read own order comments except internal" ON public.order_comments;
CREATE POLICY "customers can read own order comments except internal"
  ON public.order_comments FOR SELECT
  USING (
    public.current_app_user_has_role(ARRAY['super_admin', 'admin_manager', 'order_operator', 'accountant', 'warehouse'])
    OR (
      audience = 'customer_visible'
      AND EXISTS (
        SELECT 1
        FROM public.customer_orders o
        JOIN public.app_users u ON u.organization_id = o.organization_id
        WHERE o.id = order_comments.order_id
          AND u.auth_user_id = (SELECT auth.uid())
      )
    )
  );

-- Reconcile the two realtime tables that were RLS-enabled in production but
-- had no policies after a historical partial migration.
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

-- The old emergency migration left this exact duplicate behind.
DROP INDEX IF EXISTS public.idx_order_rev_history_order_id;

-- PostgreSQL does not automatically index referencing columns. Cover missing
-- FK prefixes deterministically to avoid slow joins and parent-row deletes as
-- operational tables grow. Existing compatible indexes are left untouched.
DO $$
DECLARE
  fk RECORD;
  index_name TEXT;
  column_list TEXT;
BEGIN
  FOR fk IN
    SELECT
      c.conname,
      c.conrelid,
      n.nspname AS schema_name,
      t.relname AS table_name,
      c.conkey
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND i.indisvalid
          AND (i.indkey::SMALLINT[])[0:cardinality(c.conkey) - 1] = c.conkey
      )
  LOOP
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY u.ordinality)
      INTO column_list
    FROM unnest(fk.conkey) WITH ORDINALITY AS u(attnum, ordinality)
    JOIN pg_attribute a
      ON a.attrelid = fk.conrelid
     AND a.attnum = u.attnum;

    index_name := left('idx_fk_' || fk.table_name || '_' || md5(fk.conname), 63);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
      index_name,
      fk.schema_name,
      fk.table_name,
      column_list
    );
  END LOOP;
END;
$$;

COMMIT;
