-- ============================================================================
-- PET TRAVEL WHOLESALE — V15: DISTRIBUTED AUTHENTICATION RATE LIMIT
-- Keeps login throttling effective across serverless instances without PII.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.auth_rate_limit_buckets (
  bucket_key text PRIMARY KEY CHECK (length(bucket_key) = 64),
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  window_expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_buckets_expiry
  ON public.auth_rate_limit_buckets (window_expires_at);

ALTER TABLE public.auth_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

COMMIT;
