-- ============================================================================
-- PET TRAVEL WHOLESALE — V14: PAYMENT PROOF LIFECYCLE INTEGRITY
-- Invariant: one payment request may have at most one proof awaiting review.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  v_duplicate_requests INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_duplicate_requests
  FROM (
    SELECT payment_request_id
    FROM public.payment_proofs
    WHERE status = 'pending_admin_confirmation'
    GROUP BY payment_request_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF v_duplicate_requests > 0 THEN
    RAISE EXCEPTION
      'V14_DUPLICATE_PENDING_PAYMENT_PROOFS: % payment request(s) require manual reconciliation before migration.',
      v_duplicate_requests;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_proofs_one_pending_per_request
  ON public.payment_proofs (payment_request_id)
  WHERE status = 'pending_admin_confirmation';

COMMIT;
