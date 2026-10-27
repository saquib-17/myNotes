-- Up Migration: Create doubts table and partial active indexes
CREATE TABLE IF NOT EXISTS doubts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  question TEXT NOT NULL,
  details TEXT NULL,
  subject TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution TEXT NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- Partial index for active doubts ordered by status, updated_at DESC, id ASC
CREATE INDEX IF NOT EXISTS idx_doubts_user_active
  ON doubts (user_id, status, updated_at DESC, id ASC)
  WHERE deleted_at IS NULL;

-- Partial index for subject filtering
CREATE INDEX IF NOT EXISTS idx_doubts_user_subject
  ON doubts (user_id, subject)
  WHERE deleted_at IS NULL;

---

-- Down Migration
DROP TABLE IF EXISTS doubts;

