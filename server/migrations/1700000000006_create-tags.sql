-- Up Migration
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_active_name
ON tags (user_id, LOWER(TRIM(name)))
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tags_user_active
ON tags (user_id, name ASC, id ASC)
WHERE deleted_at IS NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_tags_user_active;
DROP INDEX IF EXISTS idx_tags_user_active_name;
DROP TABLE IF EXISTS tags;

