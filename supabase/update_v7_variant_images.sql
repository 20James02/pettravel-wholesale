-- Add image_url to product_variants table
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url text;
