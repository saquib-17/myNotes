-- Up Migration
CREATE TABLE app_metadata (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS app_metadata;
