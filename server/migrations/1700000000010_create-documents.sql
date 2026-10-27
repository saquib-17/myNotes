-- Up Migration: Create documents table and partial active indexes
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('pdf', 'article', 'documentation', 'course', 'video', 'repository', 'other')),
  topic TEXT NULL,
  favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- Partial index for active user documents ordered by favorite DESC, updated_at DESC, id ASC
CREATE INDEX IF NOT EXISTS idx_documents_user_active
  ON documents (user_id, favorite DESC, updated_at DESC, id ASC)
  WHERE deleted_at IS NULL;

-- Partial index for filtering by category and favorite
CREATE INDEX IF NOT EXISTS idx_documents_user_filters
  ON documents (user_id, category, favorite)
  WHERE deleted_at IS NULL;

-- Partial index for topic filtering
CREATE INDEX IF NOT EXISTS idx_documents_user_topic
  ON documents (user_id, topic)
  WHERE deleted_at IS NULL;

---

-- Down Migration
DROP TABLE IF EXISTS documents;

