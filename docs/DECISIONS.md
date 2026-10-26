# MyNotes — Architectural Decisions Record (ADR)

This document records the foundational architectural decisions agreed upon for MyNotes, the trade-offs evaluated, and unresolved technical choices awaiting user direction.

---

## 1. Confirmed Architectural Decisions

### ADR-01: Single Primary Database (PostgreSQL)
- **Decision:** Use PostgreSQL as the single source of truth for both relational structured data and rich-text document structures (via `JSONB`).
- **Rationale:** Prevents data synchronization complexity, dual-connection overhead, and cognitive fragmentation. PostgreSQL handles relational integrity, foreign keys, and structured document trees robustly within ACID transaction boundaries.
- **Rejected Alternative:** Dual-database architecture using MongoDB for notes and PostgreSQL for relations. Rejected to prevent split brain, dual-schema migrations, and unnecessary stack complexity.

### ADR-02: Native Parameterized SQL via `pg` Driver
- **Decision:** Access PostgreSQL using direct parameterized SQL queries with the official `pg` driver rather than an Object-Relational Mapper (ORM) like Prisma, TypeORM, or Sequelize.
- **Rationale:** Deepens SQL fundamentals, guarantees absolute control over query performance and indexing, and prevents ORM query generation surprises.

### ADR-03: Headless Tiptap Editor with Dual Representation
- **Decision:** Use Tiptap (ProseMirror-based) for the frontend rich-text editor, storing structured nodes in a PostgreSQL `JSONB` column while maintaining a synchronized plain-text column (`content_text`) for search.
- **Rationale:** JSON schema preservation avoids HTML sanitation edge cases and formatting drift. Storing extracted plain text in a dedicated indexed column allows efficient SQL ILIKE or full-text search without parsing JSON in query execution.

### ADR-04: Modular Monolith Architecture
- **Decision:** Build a single Express backend application organized by domain modules (`auth`, `notes`, `questions`, `documents`, `tasks`, etc.) paired with a single React + Vite SPA.
- **Rationale:** Avoids the operational overhead of microservices, distributed logging, and network hops while preserving clean domain separation in code.

### ADR-05: Private File Storage with Ownership Authorization
- **Decision:** Store uploaded binary files (PDFs, images) outside the database in private storage, streaming content only through authenticated API endpoints.
- **Rationale:** Prevents database file bloat and memory pressure while strictly preventing unauthenticated public file access or hotlinking.

---

## 2. Unresolved Decisions & Explicit Recommendations

*(Note: These choices remain open for confirmation. Recommendations below are provided to assist planning and are not final approvals.)*

### DEC-01: Authentication Strategy and Session Mechanism
- **Options:**
  - *Option 1 (Approved):* HTTP-only, `SameSite=Lax` session cookies managed by `express-session` with server-side session persistence in PostgreSQL via `connect-pg-simple`, paired with Argon2id password hashing and session-bound CSRF protection.
  - *Option 2:* Stateless JWT tokens passed via Authorization headers with HTTP-only refresh tokens.
- **Evaluation:**
  - Session cookies provide instant server-side revocation on logout, prevent XSS token theft from browser memory or localStorage, eliminate client token-refresh dance logic, and align with zero-cost personal-use architecture.
- **Status:** **CONFIRMED (Stage 3A)** — *Approved and implemented: `express-session` with `connect-pg-simple`, Argon2id (`19 MiB`, 2 iterations), and synchronizer CSRF tokens. Frontend authentication screens deferred to Stage 3B.*

### DEC-02: Database Migration Tooling
- **Options:**
  - *Option 1 (Approved):* `node-pg-migrate` executing native `.sql` migration files.
  - *Option 2:* Knex migration CLI.
  - *Option 3:* Custom minimal SQL runner script.
- **Evaluation:**
  - `node-pg-migrate` provides reliable tracking in a `pgmigrations` table, supports transactional rollbacks, operates with plain SQL migration files without ORM lock-in, and natively integrates with the `pg` driver.
- **Status:** **CONFIRMED (Stage 2 Completed)** — *Approved direction and implemented: `node-pg-migrate` executing version-controlled `.sql` migration files. In Stage 2B, `pg` connection pooling and `node-pg-migrate` were configured with discrete `PG*` variables and initial baseline table `app_metadata`. Migrations are executed explicitly via CLI (`npm run db:migrate`), avoiding automatic startup execution hazards. PostgreSQL remains strictly local and zero-cost.*

### DEC-03: Development & Production File Storage Strategy
- **Options:**
  - *Development:* Local filesystem storage in a git-ignored directory (`server/storage_data/`).
  - *Production:* Pluggable storage interface allowing either a persistent volume mount or an S3-compatible private object store (e.g., AWS S3, Cloudflare R2, MinIO).
- **Status:** **OPEN** — *Recommendation: Local private storage for Stages 1–12; evaluate S3 provider prior to Stage 13 deployment.*

### DEC-04: Application Hosting & Infrastructure
- **Options:**
  - Self-hosted Docker container on a VPS (Hetzner, DigitalOcean, Linode).
  - Managed PaaS (Render, Railway, Fly.io).
- **Status:** **OPEN** — *Recommendation: Local development first; defer hosting vendor selection until Stage 13.*

### DEC-05: Future AI Provider & Processing Model
- **Options:**
  - Local model inference via Ollama.
  - Commercial API (OpenAI, Anthropic, Google Gemini).
- **Status:** **OPEN** — *Recommendation: Deferred completely to Stage 14. No AI dependencies or keys in the initial build.*
