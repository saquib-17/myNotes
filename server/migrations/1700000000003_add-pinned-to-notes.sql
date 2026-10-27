-- Up Migration
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notes_user_active_pinned_updated
ON notes (user_id, pinned DESC, updated_at DESC, id ASC)
WHERE deleted_at IS NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_notes_user_active_pinned_updated;
ALTER TABLE notes DROP COLUMN IF EXISTS pinned;

