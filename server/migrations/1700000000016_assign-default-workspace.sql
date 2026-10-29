-- Up Migration: Create Default workspace for all existing users and assign existing data
INSERT INTO workspaces (id, user_id, name, is_default, created_at, updated_at)
SELECT gen_random_uuid(), u.id, 'Default', true, now(), now()
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM workspaces w
  WHERE w.user_id = u.id AND w.deleted_at IS NULL AND w.is_default = true
);

-- Backfill notes
UPDATE notes n
SET workspace_id = w.id
FROM workspaces w
WHERE n.workspace_id IS NULL
  AND w.user_id = n.user_id
  AND w.deleted_at IS NULL
  AND w.is_default = true;

-- Backfill tasks
UPDATE tasks t
SET workspace_id = w.id
FROM workspaces w
WHERE t.workspace_id IS NULL
  AND w.user_id = t.user_id
  AND w.deleted_at IS NULL
  AND w.is_default = true;

-- Backfill questions
UPDATE questions q
SET workspace_id = w.id
FROM workspaces w
WHERE q.workspace_id IS NULL
  AND w.user_id = q.user_id
  AND w.deleted_at IS NULL
  AND w.is_default = true;

-- Backfill documents
UPDATE documents d
SET workspace_id = w.id
FROM workspaces w
WHERE d.workspace_id IS NULL
  AND w.user_id = d.user_id
  AND w.deleted_at IS NULL
  AND w.is_default = true;

-- Backfill revision_items
UPDATE revision_items r
SET workspace_id = w.id
FROM workspaces w
WHERE r.workspace_id IS NULL
  AND w.user_id = r.user_id
  AND w.deleted_at IS NULL
  AND w.is_default = true;

-- Backfill doubts
UPDATE doubts db
SET workspace_id = w.id
FROM workspaces w
WHERE db.workspace_id IS NULL
  AND w.user_id = db.user_id
  AND w.deleted_at IS NULL
  AND w.is_default = true;

-- Backfill journal_entries
UPDATE journal_entries j
SET workspace_id = w.id
FROM workspaces w
WHERE j.workspace_id IS NULL
  AND w.user_id = j.user_id
  AND w.deleted_at IS NULL
  AND w.is_default = true;

---

-- Down Migration
UPDATE notes SET workspace_id = NULL WHERE workspace_id IS NOT NULL;
UPDATE tasks SET workspace_id = NULL WHERE workspace_id IS NOT NULL;
UPDATE questions SET workspace_id = NULL WHERE workspace_id IS NOT NULL;
UPDATE documents SET workspace_id = NULL WHERE workspace_id IS NOT NULL;
UPDATE revision_items SET workspace_id = NULL WHERE workspace_id IS NOT NULL;
UPDATE doubts SET workspace_id = NULL WHERE workspace_id IS NOT NULL;
UPDATE journal_entries SET workspace_id = NULL WHERE workspace_id IS NOT NULL;
DELETE FROM workspaces WHERE name = 'Default' AND is_default = true;

