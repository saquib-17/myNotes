# MyNotes — Incremental Implementation Plan

This document details the stage-by-stage implementation plan for MyNotes. Each stage is designed to be scoped, testable, and independently verified. Testing, input validation, and security measures are integrated into every stage rather than deferred.

---

## Roadmap Overview

- **Stage 0:** Planning and Project Rules *(Completed)*
- **Stage 1:** Repository and Runnable Frontend/Backend Foundation *(Completed)*
- **Stage 2:** PostgreSQL Connection and Migrations *(Completed)*
- **Stage 3:** Authentication and Private Access *(Stage 3A completed; Stage 3B pending)*
- **Stage 4:** Application Shell and Navigation
- **Stage 5:** Core Notes Workflow
- **Stage 6:** Note Organization and Recovery
- **Stage 7:** Important-Question Bank
- **Stage 8:** Document Library
- **Stage 9:** Tasks and Quick Capture
- **Stage 10:** Connected Workspaces
- **Stage 11:** Revision and Doubt Tracking
- **Stage 12:** Dashboard and Journal
- **Stage 13:** Release Hardening, Export, Recovery, and Deployment
- **Stage 14:** Separately Approved Advanced Enhancements

---

### Stage 0: Planning and Project Rules *(Completed)*

- **Objective:** Inspect workspace, preserve existing state, define architecture, scope, rules, and incremental roadmap without generating code or installing packages.
- **Dependencies:** None.
- **Tasks:**
  1. Inspect workspace directory and git status.
  2. Create comprehensive project specification (`PROJECT_SPEC.md`).
  3. Create system architecture blueprint (`ARCHITECTURE.md`).
  4. Create incremental implementation plan (`IMPLEMENTATION_PLAN.md`).
  5. Create development standards and rules (`DEVELOPMENT_RULES.md`).
  6. Create architecture decisions record (`DECISIONS.md`).
  7. Create project readme (`README.md`).
- **Acceptance Criteria:**
  - All 6 documentation files exist with consistent scope and terminology.
  - No application code, package manifests, or external services created.
  - Open technical choices clearly identified.
- **Verification Approach:** Manual file review and link validation.
- **Explicit Exclusions:** No `npm install`, no code generation, no database setup.

---

### Stage 1: Repository and Runnable Frontend/Backend Foundation *(Completed)*

- **Objective:** Establish the project repository, version control, and running skeleton servers for frontend (React + Vite) and backend (Node.js + Express) with health checks.
- **Dependencies:** Stage 0 documentation approved.
- **Tasks:**
  1. Initialize Git repository and create comprehensive `.gitignore` (node_modules, .env, storage_data, build artifacts).
  2. Scaffold `server/` with `package.json`, Express application, health check endpoint (`GET /api/health`), and test runner.
  3. Scaffold `client/` using Vite + React with basic Tailwind CSS configuration.
  4. Configure local environment file templates (`.env.example` in client and server with non-secret placeholders).
  5. Configure development proxy in Vite to route `/api` calls to the Express backend.
  6. Write automated test verifying the Express health check endpoint.
- **Acceptance Criteria:**
  - Running backend serves `GET /api/health` returning `{ status: "ok" }`.
  - Running frontend displays a clean welcome view and connects to the backend health endpoint.
  - No secret credentials present in repository.
- **Verification Approach:**
  - Run backend unit/integration tests with `npm test`.
  - Execute frontend build check with `npm run build`.
  - Test `/api/health` response in browser or curl.
- **Explicit Exclusions:** Database tables, authentication routes, complex UI components.

---

### Stage 2: PostgreSQL Connection and Migrations *(Completed)*

#### Stage 2A: PostgreSQL Environment Inspection and Safe Setup Planning *(Completed)*

- **Objective:** Non-destructively inspect the local Windows environment, verify PostgreSQL client and service availability, verify runtime compatibility (`pg` and `node-pg-migrate` on Node.js 22), and produce an isolated local setup and configuration plan without creating databases, executing migrations, or installing dependencies.
- **Dependencies:** Stage 1 runnable foundation.
- **Tasks:**
  1. Inspect local environment safely: discovered PostgreSQL 18.6 CLI (`psql`, `pg_dump`, `pg_isready`), running Windows service `postgresql-x64-18`, and active listening port `5432`.
  2. Verify tooling compatibility: Node.js `v22.14.0` with `pg` (`>=16.0.0`) and `node-pg-migrate` (`>=20.11.0`).
  3. Formulate zero-cost, local-only database architecture (`mynotes_dev` database, dedicated non-superuser `mynotes_app` role).
  4. Create comprehensive setup and troubleshooting guide (`docs/LOCAL_DATABASE_SETUP.md`).
  5. Update architectural decisions log (`docs/DECISIONS.md`) for `node-pg-migrate` and zero-cost local PostgreSQL.
- **Acceptance Criteria:**
  - Clear categorization of confirmed findings vs. intentionally unknown properties (no credentials queried or disclosed).
  - Explicit, safe, user-executed role and database provisioning commands documented with interactive `\password`.
  - Zero-cost architecture preserved without cloud dependencies.
  - No database changes, migrations, or npm packages installed in this stage.
- **Verification Approach:**
  - Non-intrusive CLI checks (`pg_isready -h localhost -p 5432`, `Get-Service`, port probe).
  - Review documentation against project standards.
- **Explicit Exclusions:** No database creation, no table creation, no migrations, no `npm install`, no application code changes.

#### Stage 2B: PostgreSQL Connection Pool, Migrations, and Verification *(Completed)*

- **Objective:** Configure connection pool using the `pg` driver, establish an atomic SQL migration system via `node-pg-migrate`, create baseline foundation table `app_metadata`, provide verification commands, and verify schema versioning and HTTP readiness without implementing users, business tables, or automatic migration-on-startup.
- **Dependencies:** Stage 2A setup plan reviewed and local `mynotes_dev` database provisioned by user.
- **Tasks:**
  1. Install `pg` (`^8.23.1`) and `node-pg-migrate` (`^9.0.0`) in `server/`.
  2. Configure connection settings in `server/.env.example` using discrete `PG*` variables with finite timeouts.
  3. Implement connection pool module (`server/src/db/pool.js`) with bounded shutdown and lazy initialization so importing `app.js` never triggers database connections.
  4. Implement migration runner (`server/src/db/migrate.js`) with safety pre-checks (identity, database name, collision checks) using `node-pg-migrate`.
  5. Create initial additive migration `server/migrations/1700000000000_create-app-metadata.sql` defining `app_metadata` (`key`, `value`, `created_at`).
  6. Implement read-only migration status inspector (`server/src/db/migrateStatus.js`).
  7. Implement database verification command (`server/src/db/check.js`).
  8. Implement readiness endpoint `GET /api/ready` with testing injection seam, returning 200 on healthy schema and 503 on unready/down state, with zero credential or internal error leakage.
  9. Add isolated unit/API test suite verifying readiness routes and configuration validation without touching the developer database.
  10. Update project documentation (`README.md`, `LOCAL_DATABASE_SETUP.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `IMPLEMENTATION_PLAN.md`).
- **Acceptance Criteria:**
  - Backend connects securely using parameterized queries over discrete `PG*` variables.
  - Migration script executes up-migrations inside a single transaction and records execution in `pgmigrations`.
  - Migration script is idempotent on subsequent runs.
  - `GET /api/health` preserved intact as process health.
  - `GET /api/ready` returns 200 over HTTP when database and foundation schema are ready; returns 503 when down.
  - No secret credentials printed or leaked.
  - No business tables (notes, questions, etc.) or authentication/users schema created.
  - All tests, lints, and builds pass cleanly.
- **Verification Approach:**
  - Run `npm run db:check`, `npm run db:migrate`, `npm run db:migrate:status`.
  - Verify HTTP responses for `/api/health` and `/api/ready`.
  - Run `npm test` and `npm run lint` in `server/`.
  - Run `npm run lint` and `npm run build` in `client/`.
  - Run `npm audit` across client and server.
- **Explicit Exclusions:** Domain tables (notes, tasks, etc.), authentication routes, users table, frontend changes.

---

### Stage 3: Authentication and Private Access *(In Progress)*

#### Stage 3A: Authentication Backend and PostgreSQL-Backed Sessions *(Completed)*

- **Objective:** Implement secure backend authentication, password hashing, session persistence in PostgreSQL via `connect-pg-simple`, CSRF protection, and endpoint throttling without implementing frontend auth screens or business tables.
- **Dependencies:** Stage 2 database and migration foundation.
- **Tasks:**
  1. Add Argon2id password hashing and validation (`server/src/auth/password.js`) with explicit OWASP parameters (`19 MiB` memory, `2` iterations, `1` lane) and precomputed dummy hash to prevent timing-based account enumeration.
  2. Implement password policy: 15–128 characters, allowing spaces and Unicode without silent truncation.
  3. Create migration `server/migrations/1700000000001_create-users-and-sessions.sql` creating `users` (with lowercase, trimmed unique email index) and `session` (for `connect-pg-simple`).
  4. Configure `express-session` with `connect-pg-simple` store (`server/src/auth/sessionStore.js`) reusing the existing shared pool and clearing prune timers on shutdown.
  5. Implement session-bound synchronizer CSRF tokens (`server/src/auth/csrf.js`) with constant-time token comparison and strict Origin validation.
  6. Implement in-process rate limiting (`server/src/auth/rateLimiter.js`) for login (5 attempts / 15m) and registration (10 attempts / 60m).
  7. Implement auth endpoints (`server/src/routes/auth.routes.js`): `GET /api/auth/csrf`, `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.
  8. Implement `requireAuth` middleware (`server/src/auth/requireAuth.js`) verifying active session and database user record.
  9. Mount health and readiness endpoints BEFORE session middleware to guarantee probes never generate session rows or cookies.
  10. Write isolated unit and integration test suite (`server/test/auth.test.js`) independent of the developer database.
  11. Perform live database verification verifying registration, login, session persistence in PostgreSQL, and logout with automated cleanup.
- **Acceptance Criteria:**
  - Passwords hashed with Argon2id; plaintext passwords never stored or returned.
  - Session IDs regenerated on login; sessions persisted in PostgreSQL `"session"` table and destroyed on logout.
  - State-changing requests enforce CSRF tokens and valid Origin headers.
  - Generic 401 on authentication failures with timing protection.
  - Health/readiness checks unaffected and never create session rows or cookies.
  - All unit/API tests (21/21) pass cleanly; lints and production build pass with 0 errors.
- **Verification Approach:**
  - Automated isolated tests in `server/test/auth.test.js`.
  - Live PostgreSQL integration check (`server/test/live_auth_check.js`).
  - Lint and audit verification across workspaces.
- **Explicit Exclusions:** Frontend auth screens, OAuth, password reset email delivery, multi-factor authentication (MFA), business domain tables.

#### Stage 3B: Frontend Authentication Screens & Private Navigation *(Pending / Next Stage)*

- **Objective:** Build client-side AuthContext, accessible Login and Registration forms with explicit loading/error states, CSRF token management, and authenticated route protection.
- **Dependencies:** Stage 3A backend foundation.
- **Tasks:**
  1. Create client-side `AuthContext` managing user state, login, register, logout, and CSRF token fetching.
  2. Implement Login view with accessible form controls, validation, and error feedback.
  3. Implement Registration view with password strength guidance matching the 15-character policy.
  4. Implement `ProtectedRoute` component redirecting unauthenticated users to `/login`.
  5. Update navigation header/shell to show current authenticated user and Logout button.
  6. Write automated frontend tests verifying form validation, login flows, and route protection.
- **Acceptance Criteria:**
  - Client state reflects authenticated user across page reloads.
  - Unauthenticated users cannot access private application views.
  - Clean error feedback on invalid credentials, duplicate registrations, and network errors.
- **Verification Approach:**
  - Frontend component and integration tests.
  - Manual verification through Vite development proxy.
- **Explicit Exclusions:** Domain views (Notes, Tasks), OAuth, account recovery forms.

---

### Stage 4: Application Shell and Navigation

- **Objective:** Build a responsive, accessible application shell featuring sidebar navigation, quick-action buttons, user status, and explicit notification/toast feedback.
- **Dependencies:** Stage 3 authentication.
- **Tasks:**
  1. Build AppShell component with responsive, collapsible sidebar and mobile navigation drawer.
  2. Implement primary navigation routes: Notes, Questions, Documents, Tasks, Workspaces, Revision, Journal, Settings.
  3. Implement global notification/toast system supporting `info`, `success`, and `error` states.
  4. Implement an active user indicator with a one-click Logout trigger.
  5. Implement keyboard navigation accessibility (accessible focus states, skip-links, ARIA landmarks).
- **Acceptance Criteria:**
  - Navigation operates seamlessly across desktop and mobile screen sizes.
  - Active navigation state reflects the current route.
  - Accessible keyboard navigation verified on primary interactive controls.
- **Verification Approach:**
  - Frontend component tests.
  - Manual browser testing at multiple viewport widths (mobile, tablet, desktop).
- **Explicit Exclusions:** Final module screens (modules will use clean placeholder views until their stage).

---

### Stage 5: Core Notes Workflow

- **Objective:** Implement the primary note-taking experience with Tiptap rich-text editing, code syntax highlighting, continuous autosave, and plain-text search indexing.
- **Dependencies:** Stage 4 application shell.
- **Tasks:**
  1. Create migration `002_create_notes.sql` (`id`, `user_id`, `title`, `content_json`, `content_text`, `is_pinned`, `is_favorite`, `is_archived`, `is_trashed`, `created_at`, `updated_at`).
  2. Implement backend note CRUD endpoints:
     - `GET /api/notes` (with search and filters)
     - `POST /api/notes`
     - `GET /api/notes/:id`
     - `PUT /api/notes/:id`
     - `DELETE /api/notes/:id` (soft delete)
  3. Implement backend Tiptap-to-plaintext extractor to populate `content_text` on every update.
  4. Integrate Tiptap editor in the frontend with support for Headings, Lists, Blockquotes, Links, and Code Blocks.
  5. Implement autosave hook with clear UI status (`Unsaved`, `Saving...`, `Saved at HH:mm`, `Error`).
  6. Add unit and integration tests for note CRUD and ownership verification.
- **Acceptance Criteria:**
  - Rich-text and code blocks persist and reload accurately without layout distortion.
  - Autosave operates debounced without dropping keystrokes or overwriting newer changes.
  - Users can only read and modify their own notes.
  - Content is searchable via backend query.
- **Verification Approach:**
  - Automated API tests for note ownership enforcement and CRUD operations.
  - End-to-end browser check of editor typing, autosave trigger, and page refresh persistence.
- **Explicit Exclusions:** Nested folder hierarchies, version history diffs, PDF export.

---

### Stage 6: Note Organization and Recovery

- **Objective:** Provide structured organization for notes via hierarchical collections, multi-tag assignment, pinning, favorites, and trash/recovery management.
- **Dependencies:** Stage 5 core notes.
- **Tasks:**
  1. Create migration for `collections`, `tags`, and `note_tags`.
  2. Implement collection management endpoints: create, rename, re-parent, delete (with orphaned note protection).
  3. Implement tagging system: tag autocomplete, assignment to notes, and tag-filtered views.
  4. Build sidebar Collection Tree and Tag Cloud in the frontend.
  5. Build Trash and Archive views with one-click Restore and permanent purge with confirmation.
  6. Write automated tests for collection hierarchy, tagging logic, and soft-delete recovery.
- **Acceptance Criteria:**
  - Notes can be moved between collections and tagged with multiple tags.
  - Trashed notes are excluded from active search results and regular collection views.
  - Restoring a note restores it to its previous collection or root if collection was removed.
- **Verification Approach:**
  - Automated tests covering tag creation, association, and soft-delete filters.
  - UI verification of moving notes, pinning notes, filtering by tag, and trashing/restoring.
- **Explicit Exclusions:** Drag-and-drop tree reordering (initially simple selector/dropdowns).

---

### Stage 7: Important-Question Bank

- **Objective:** Implement a dedicated question bank for conceptual mastery, interview prep, and self-testing with hidden answers.
- **Dependencies:** Stage 4 application shell and Stage 5 note links.
- **Tasks:**
  1. Create migration for `questions` and `question_review_logs`.
  2. Implement backend CRUD endpoints for questions including topic, difficulty, importance, and mastery status.
  3. Implement linking between questions and related notes (`note_id` foreign key or junction).
  4. Build Question List view with filters by topic, difficulty, and mastery level.
  5. Build **Self-Test Mode** UI:
     - Prompts displayed with answers and code examples masked.
     - "Reveal Answer" toggle.
     - Self-rating buttons (`Forgot`, `Partial`, `Confident`) that record a review attempt.
  6. Add automated tests for question creation, updating, and review attempt logging.
- **Acceptance Criteria:**
  - Answers and code examples are strictly hidden in Self-Test Mode until explicitly toggled.
  - Review ratings are recorded in `question_review_logs` with timestamps.
  - Question detail links smoothly to referenced notes.
- **Verification Approach:**
  - Unit tests for question service and API endpoints.
  - Visual and functional check of answer obscuring and self-rating feedback.
- **Explicit Exclusions:** Automatic spaced repetition scheduling algorithms (handled in Stage 11).

---

### Stage 8: Document Library

- **Objective:** Implement private file uploads, secure metadata tracking, PDF and image previews, and document linking.
- **Dependencies:** Stage 4 application shell and Stage 5 notes.
- **Tasks:**
  1. Create migration for `documents` (`id`, `user_id`, `original_name`, `storage_path`, `mime_type`, `size_bytes`, `description`, `created_at`).
  2. Implement backend file upload handler with strict file size limits and MIME-type validation (PDF, PNG, JPG, WebP, TXT).
  3. Implement secure download and streaming endpoints (`GET /api/documents/:id/download`, `GET /api/documents/:id/preview`) with ownership verification.
  4. Build Document Library UI showing file cards, metadata, search, and upload dropzone.
  5. Implement in-browser preview modal for PDFs and images.
  6. Implement document linking to notes and questions.
  7. Write tests for upload size enforcement, disallowed file rejection, and private stream authorization.
- **Acceptance Criteria:**
  - Uploaded files are stored securely outside public web roots with UUID names.
  - Unauthorized users cannot access files even if knowing the file ID.
  - Supported PDFs and images preview smoothly in the browser.
- **Verification Approach:**
  - Automated security tests verifying 403/401 on unauthorized document download requests.
  - File upload validation tests with valid and malicious/disallowed file formats.
- **Explicit Exclusions:** OCR text extraction, binary document content indexing, cloud S3 storage (local storage in this stage).

---

### Stage 9: Tasks and Quick Capture

- **Objective:** Build a daily task planner with status views (Today, Upcoming, Overdue) and a universal Quick-Capture Inbox.
- **Dependencies:** Stage 4 application shell and Stage 5 notes.
- **Tasks:**
  1. Create migration for `tasks` and `inbox_items`.
  2. Implement task CRUD endpoints with priority, due date, status, subtask checklist, and note link.
  3. Implement inbox capture endpoint: `POST /api/inbox` and triage endpoints (convert to task, note, or question).
  4. Build Tasks view with filtered tabs: `Today`, `Upcoming`, `Overdue`, `Completed`.
  5. Build universal Quick-Capture modal accessible via global shortcut or header button.
  6. Build Inbox triage interface allowing fast conversion or archiving.
  7. Add tests for due date filtering, task completion, and inbox conversion.
- **Acceptance Criteria:**
  - Quick-capture items can be saved in under 3 seconds from anywhere in the app.
  - Inbox items convert seamlessly into a Note or Task without loss of captured text.
  - Tasks accurately categorize into Today, Upcoming, and Overdue based on the user's local date.
- **Verification Approach:**
  - Automated API tests for date filters and conversion endpoints.
  - Interactive UI tests for quick modal capture and task completion checkboxes.
- **Explicit Exclusions:** Recurring task scheduling engine, push notifications.

---

### Stage 10: Connected Workspaces

- **Objective:** Create unified Topic/Project Workspaces that reference notes, questions, documents, and tasks in a single view without data duplication.
- **Dependencies:** Stages 5, 7, 8, and 9.
- **Tasks:**
  1. Create migration for `workspaces` and `workspace_items` (junction table supporting entity types).
  2. Implement workspace CRUD and item association endpoints (`add_item`, `remove_item`).
  3. Build Workspace view displaying aggregated tabs or panels:
     - Linked Notes
     - Linked Questions
     - Linked Documents
     - Linked Tasks
  4. Build "Add to Workspace" picker inside Note, Question, Document, and Task detail views.
  5. Write tests verifying that removing an item from a workspace does not delete the underlying entity.
- **Acceptance Criteria:**
  - A workspace displays references to diverse entities in one coherent screen.
  - Updates to a note or task are immediately visible within the connected workspace.
  - Deleting a workspace preserves all underlying notes, questions, and documents.
- **Verification Approach:**
  - Automated tests for junction associations and cascade protection.
  - UI workflow test: create workspace -> link items -> verify single source of truth.
- **Explicit Exclusions:** Customizable drag-and-drop dashboard grid widgets.

---

### Stage 11: Revision and Doubt Tracking

- **Objective:** Implement a deterministic review queue for questions and notes, plus an explicit Doubt lifecycle tracker.
- **Dependencies:** Stage 7 question bank and Stage 5 notes.
- **Tasks:**
  1. Create migration for `doubts` (`id`, `user_id`, `title`, `description`, `status`, `source_note_id`, `resolution_note_id`, `created_at`, `resolved_at`).
  2. Implement deterministic revision scheduling logic:
     - `Forgot`: resets interval to 1 day.
     - `Partial`: maintains interval at 3 days.
     - `Confident`: doubles interval (e.g., 1 -> 3 -> 7 -> 14 -> 30 days).
  3. Implement backend revision queue endpoint: `GET /api/revision/queue`.
  4. Implement Doubt management endpoints and resolution linking.
  5. Build Revision Queue UI showing due review cards with one-click rating triggers.
  6. Build Doubt Tracker UI with status filters (`Unresolved`, `Investigating`, `Resolved`).
  7. Add automated tests for interval calculation rules and doubt status transitions.
- **Acceptance Criteria:**
  - Review queue accurately lists items whose `next_review_date <= CURRENT_DATE`.
  - Self-rating updates `next_review_date` deterministically and records the review log.
  - Doubts link clearly to their source and resolution notes.
- **Verification Approach:**
  - Pure unit tests for the deterministic scheduling math.
  - Integration tests for doubt lifecycle and review queue querying.
- **Explicit Exclusions:** Complex neural/ML retention algorithms.

---

### Stage 12: Dashboard and Journal

- **Objective:** Implement a daily reflective journal and an actionable central dashboard unifying daily priorities, reviews, recent notes, and open doubts.
- **Dependencies:** Stages 5 through 11.
- **Tasks:**
  1. Create migration for `journal_entries` (`id`, `user_id`, `entry_date`, `content_json`, `content_text`, `summary`, `created_at`).
  2. Implement backend endpoints for journal entries by date and dashboard aggregation (`GET /api/dashboard`).
  3. Build Daily Dashboard UI with 4 active widgets:
     - Today's Top Tasks
     - Due Revision Items
     - Recently Edited Notes
     - Open Doubts
  4. Build Journal UI with calendar date picker, daily reflection prompts, and weekly retrospective view.
  5. Add tests for journal date uniqueness per user and dashboard query performance.
- **Acceptance Criteria:**
  - Dashboard loads all daily metrics in a single optimized request.
  - Daily journal saves notes tied strictly to the selected calendar day.
  - Navigating to any dashboard item routes directly to the item's view.
- **Verification Approach:**
  - Automated API tests for dashboard summary data aggregation.
  - UI check of dashboard responsiveness and journal daily navigation.
- **Explicit Exclusions:** Automated AI summary generation (reserved for Stage 14).

---

### Stage 13: Release Hardening, Export, Recovery, and Deployment

- **Objective:** Finalize security hardening, backup/export mechanisms, environment configurations, and deployment readiness for MVP.
- **Dependencies:** All previous MVP stages (Stages 1 through 12).
- **Tasks:**
  1. Implement comprehensive data export endpoint (`GET /api/export` producing a structured ZIP of markdown notes, metadata JSON, and private files).
  2. Implement database backup and restore instructions and verification scripts.
  3. Security audit: verify CORS restrictions, HTTP security headers (Helmet), input sanitization, rate limiting on auth routes, and strict file download permissions.
  4. Frontend production build optimization and bundle analysis.
  5. Dockerfile / production runbook creation for containerized or standard server deployment.
  6. End-to-end integration test suite covering the entire user journey (Register -> Capture -> Note -> Task -> Question -> Review -> Export).
- **Acceptance Criteria:**
  - Production build succeeds without errors or warnings.
  - Full data export generates a valid archive containing user content and files.
  - All automated unit, integration, and security checks pass.
  - Production deployment documentation is verified and complete.
- **Verification Approach:**
  - Execution of full test suite across client and server.
  - Clean export-and-unpack test validating file and note integrity.
- **Explicit Exclusions:** AI feature development.

---

### Stage 14: Separately Approved Advanced Enhancements

*(Note: Requires separate explicit user approval before planning or implementation begins.)*

- **Objective:** Explore advanced optional capabilities including local/scoped AI integration, document OCR, and cloud object storage adapters.
- **Dependencies:** Completed and hardened MVP (Stage 13).
- **Potential Scope Items:**
  - Private S3 / MinIO storage adapter for uploaded files.
  - Scoped AI query assistant grounded strictly in user-selected notes with source citations.
  - Automated draft question generation from selected note text.
  - Python / Flask worker for heavy document OCR or text extraction workloads if justified.
  - Note revision history and version diff visualizer.
- **Acceptance Criteria:**
  - Explicit architectural proposal, security review, and user sign-off prior to any code creation.
