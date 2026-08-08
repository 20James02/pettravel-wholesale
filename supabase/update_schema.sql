-- Migration patch to align Supabase baseline tables with advanced catalog & checkout features.
-- Run this in the Supabase SQL Editor if you get database column errors.

-- 1. Add missing catalog fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images text[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight numeric(10, 2) DEFAULT 0.0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags text[];

-- 2. Add missing shipping fields to customer_orders table
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS recipient_phone text;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS recipient_address text;
