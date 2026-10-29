-- Up Migration: Create workspaces table and indexes
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- Partial unique index: at most one active default workspace per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_user_default
  ON workspaces (user_id)
  WHERE is_default = true AND deleted_at IS NULL;

-- Partial unique index: unique active workspace names per user, case-insensitive, trimmed
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_user_active_name
  ON workspaces (user_id, LOWER(TRIM(name)))
  WHERE deleted_at IS NULL;

-- Index for listing active workspaces sorted by default first, then name
CREATE INDEX IF NOT EXISTS idx_workspaces_user_active_list
  ON workspaces (user_id, is_default DESC, name ASC, id ASC)
  WHERE deleted_at IS NULL;

---

-- Down Migration
DROP INDEX IF EXISTS idx_workspaces_user_active_list;
DROP INDEX IF EXISTS idx_workspaces_user_active_name;
DROP INDEX IF EXISTS idx_workspaces_user_default;
DROP TABLE IF EXISTS workspaces;

