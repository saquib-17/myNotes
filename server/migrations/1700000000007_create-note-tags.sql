-- Up Migration
CREATE TABLE IF NOT EXISTS note_tags (
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags (note_id);

-- Down Migration
DROP INDEX IF EXISTS idx_note_tags_note_id;
DROP INDEX IF EXISTS idx_note_tags_tag_id;
DROP TABLE IF EXISTS note_tags;

