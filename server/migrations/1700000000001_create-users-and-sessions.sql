-- Up Migration
-- Table: users
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce lowercase, trimmed email uniqueness at database level
CREATE UNIQUE INDEX idx_users_email_unique ON users (lower(trim(email)));

-- Table: session (managed PostgreSQL session store for connect-pg-simple)
CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX "IDX_session_expire" ON "session" ("expire");

-- Down Migration
DROP INDEX IF EXISTS "IDX_session_expire";
DROP TABLE IF EXISTS "session";
DROP INDEX IF EXISTS idx_users_email_unique;
DROP TABLE IF EXISTS users;
