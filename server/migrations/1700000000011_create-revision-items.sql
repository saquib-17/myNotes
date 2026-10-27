-- Up Migration: Create revision_items table and partial active indexes
CREATE TABLE IF NOT EXISTS revision_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  details TEXT NULL,
  subject TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'revised')),
  revised_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- Partial index for active revision items ordered by status, updated_at DESC, id ASC
CREATE INDEX IF NOT EXISTS idx_revision_items_user_active
  ON revision_items (user_id, status, updated_at DESC, id ASC)
  WHERE deleted_at IS NULL;

-- Partial index for subject filtering
CREATE INDEX IF NOT EXISTS idx_revision_items_user_subject
  ON revision_items (user_id, subject)
  WHERE deleted_at IS NULL;

---

-- Down Migration
DROP TABLE IF EXISTS revision_items;

