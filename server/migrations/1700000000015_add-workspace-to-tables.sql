-- Up Migration: Add workspace_id columns, foreign keys, and indexes
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE RESTRICT;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE RESTRICT;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE RESTRICT;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE RESTRICT;

ALTER TABLE revision_items
  ADD COLUMN IF NOT EXISTS workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE RESTRICT;

ALTER TABLE doubts
  ADD COLUMN IF NOT EXISTS workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE RESTRICT;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE RESTRICT;

-- Indexes for user_id + workspace_id filtering
CREATE INDEX IF NOT EXISTS idx_notes_user_workspace
  ON notes (user_id, workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_user_workspace
  ON tasks (user_id, workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_user_workspace
  ON questions (user_id, workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_user_workspace
  ON documents (user_id, workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_revision_items_user_workspace
  ON revision_items (user_id, workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_doubts_user_workspace
  ON doubts (user_id, workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_workspace
  ON journal_entries (user_id, workspace_id)
  WHERE deleted_at IS NULL;

-- Journal entries: Replace unique index to allow one entry per user per workspace per calendar date
DROP INDEX IF EXISTS idx_journal_entries_user_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_user_workspace_date
  ON journal_entries (user_id, workspace_id, entry_date)
  WHERE deleted_at IS NULL;

---

-- Down Migration
DROP INDEX IF EXISTS idx_journal_entries_user_workspace_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_user_date
  ON journal_entries (user_id, entry_date)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_journal_entries_user_workspace;
DROP INDEX IF EXISTS idx_doubts_user_workspace;
DROP INDEX IF EXISTS idx_revision_items_user_workspace;
DROP INDEX IF EXISTS idx_documents_user_workspace;
DROP INDEX IF EXISTS idx_questions_user_workspace;
DROP INDEX IF EXISTS idx_tasks_user_workspace;
DROP INDEX IF EXISTS idx_notes_user_workspace;

ALTER TABLE journal_entries DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE doubts DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE revision_items DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE documents DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE questions DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE notes DROP COLUMN IF EXISTS workspace_id;

