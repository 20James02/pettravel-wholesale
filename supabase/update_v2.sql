-- Create RPC function to allow backend to run auto-migrations and reload cache
CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    EXECUTE sql_query;
END;
$$;

-- 1. Add phone, password_hash, and avatar_url to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS avatar_url text;

-- Add unique constraint on phone if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'app_users_phone_key'
    ) THEN
        ALTER TABLE app_users ADD CONSTRAINT app_users_phone_key UNIQUE (phone);
    END IF;
END
$$;

-- 2. Add assigned_staff_id to customer_orders for locking active sessions.
-- app_users.id is text in the current baseline schema.
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS assigned_staff_id text REFERENCES app_users(id) ON DELETE SET NULL;
