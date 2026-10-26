-- Up Migration
-- Table: notes (Stage 5A private notes schema)
CREATE TABLE notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL,
  content_json jsonb NOT NULL,
  content_text text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Partial index supporting active-note listing by owner and updated_at descending
CREATE INDEX idx_notes_user_active_updated ON notes (user_id, updated_at DESC, id ASC)
WHERE deleted_at IS NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_notes_user_active_updated;
DROP TABLE IF EXISTS notes;
