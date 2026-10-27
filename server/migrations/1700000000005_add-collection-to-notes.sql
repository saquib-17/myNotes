-- Up Migration
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS collection_id uuid NULL REFERENCES collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notes_user_collection
ON notes (user_id, collection_id, pinned DESC, updated_at DESC, id ASC)
WHERE deleted_at IS NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_notes_user_collection;
ALTER TABLE notes DROP COLUMN IF EXISTS collection_id;

