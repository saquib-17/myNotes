-- Up Migration: Create questions table and partial active indexes
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('SHORT_ANSWER', 'MCQ', 'CODING')),
  question TEXT NOT NULL,
  answer TEXT NULL,
  explanation TEXT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  options JSONB NULL,
  correct_option_index INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'unlearned' CHECK (status IN ('unlearned', 'learning', 'mastered')),
  topic TEXT NULL,
  last_practiced_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- Partial index for active user questions ordered by updated_at DESC, id ASC
CREATE INDEX IF NOT EXISTS idx_questions_user_active
  ON questions (user_id, updated_at DESC, id ASC)
  WHERE deleted_at IS NULL;

-- Partial index for filtering by type, difficulty, status
CREATE INDEX IF NOT EXISTS idx_questions_user_filters
  ON questions (user_id, type, difficulty, status)
  WHERE deleted_at IS NULL;

-- Partial index for topic filtering
CREATE INDEX IF NOT EXISTS idx_questions_user_topic
  ON questions (user_id, topic)
  WHERE deleted_at IS NULL;

---

-- Down Migration
DROP TABLE IF EXISTS questions;

