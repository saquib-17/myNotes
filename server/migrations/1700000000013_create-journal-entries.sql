-- Up Migration: Create journal_entries table and indexes
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- Partial unique index: enforces one active journal entry per user per calendar date
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_user_date
  ON journal_entries (user_id, entry_date)
  WHERE deleted_at IS NULL;

-- Partial index for user-owned journal listing, date ordering, and soft-delete exclusion
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date_order
  ON journal_entries (user_id, entry_date DESC, id ASC)
  WHERE deleted_at IS NULL;

---

-- Down Migration
DROP INDEX IF EXISTS idx_journal_entries_user_date_order;
DROP INDEX IF EXISTS idx_journal_entries_user_date;
DROP TABLE IF EXISTS journal_entries;

