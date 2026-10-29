-- Up Migration
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;

-- Down Migration
ALTER TABLE users DROP COLUMN IF EXISTS display_name;

