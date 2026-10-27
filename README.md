# MyNotes

MyNotes is a knowledge-first personal workspace for writing notes, collecting important questions, storing documents, managing daily activities, and reviewing what you learn.

## Core Workflow

MyNotes follows a 5-step knowledge and execution loop:

```
Capture  ──►  Organize  ──►  Connect  ──►  Act  ──►  Review
 (Inbox)      (Folders/Tags)  (Workspaces) (Tasks)  (Revision/Journal)
```

1. **Capture:** Rapidly record thoughts, notes, doubts, questions, tasks, links, and documents into an inbox without friction.
2. **Organize:** Structure items with collections, tags, status flags, priorities, and hierarchical organization.
3. **Connect:** Associate notes, questions, documents, and tasks inside unified project or topic workspaces without duplicating content.
4. **Act:** Plan and execute daily work with prioritized tasks, scheduled views (Today, Upcoming, Overdue), and direct references to relevant notes.
5. **Review:** Solidify learning through spaced revision, an answer-hidden self-test question bank, doubt tracking, and daily/weekly reflective logs.

---

## Approved Technical Direction

- **Architecture:** Modular monolith with a separated frontend Single Page Application (SPA) and backend REST API.
- **Frontend:** [React](https://react.dev/) + [Vite](https://vitejs.dev/) (JavaScript, JSX).
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) with `@tailwindcss/vite`.
- **Backend:** [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) (JavaScript, ES modules).
- **Database:** [PostgreSQL](https://www.postgresql.org/) using parameterized SQL queries via the official `pg` driver (Stage 2).
- **Schema Management:** Version-controlled database migrations (Stage 2).
- **File Storage:** Private local filesystem storage during development, designed for migration to private cloud object storage when deployed.
- **Version Control:** Git.

### Stack Boundaries & Non-Goals for Initial Foundation
- **No dual-database setup:** PostgreSQL is the single primary database; MongoDB will not be run alongside PostgreSQL.
- **No TypeScript initially:** Pure JavaScript across frontend and backend for the initial implementation stages.
- **No microservices or Kubernetes:** Single deployable modular backend.
- **No initial Redis or Vector DB:** In-memory or relational mechanisms until a concrete, approved requirement arises.
- **No real-time collaborative editing:** Designed as a personal-use workspace with reliable autosave and access control.
- **No AI dependencies in early stages:** Core notes, documents, and tasks must be complete and stable before any optional AI integration is considered.

---

## Current Status

> **Stage 5 Core Notes Reliability Pass Completed: End-to-End Workflow & Visibility**
>
> In response to a user-reported defect where saved notes failed to appear in the Notes section, a full end-to-end audit diagnosed and corrected a contract discrepancy between the backend listing endpoint (`items`) and frontend expectations (`data.notes`, `data.total`). The end-to-end create → edit → save → list → reopen workflow is now reliable, truthful, and verified.
> - **Unified API & Client Contract:** Backend `GET /api/notes` now returns both `notes` and `items` as reciprocal aliases, along with an authoritative `total` count derived from a SQL `COUNT(*)` query. `notes.service.js` and `NotesPage.jsx` defensively handle either format.
> - **Pure Explicit Manual Save:** Edits are persisted only upon intentional user action: clicking "Save note" or pressing `Ctrl+S` / `Cmd+S`. Autosave remains completely removed.
> - **In-Flight Save Freeze:** While saving, the editor is set to read-only (`editable={false}`), input controls and formatting toolbar buttons are disabled, and the button indicates "Saving...". Interactivity is restored immediately upon server response.
> - **Outdated Offset Recovery:** If an offset becomes invalid (e.g. after notes are deleted or a search reduces results), `NotesPage` gracefully recovers to the last valid page without an infinite loop.
> - **Stale Response Protection:** Network request generations prevent out-of-order or aborted responses from overwriting newer search results or listing data.
> - **Structural Baseline Comparison:** Key-order-agnostic recursive equality checker (`deepEqual`) prevents spurious dirty state changes.
> - **Supported Router Navigation Guard (`useBlocker`):** React Router v7 Data Router navigation guard intercepts uncommitted navigation, offering explicit "Stay" vs "Discard changes and leave".
> - **Shell Pre-Logout Coordination:** `AppLayout` queries active editor dirty state before calling `logout()`, prompting the user before session destruction.
> - **Clean Trash Soft-Deletion:** Soft-deleting a note bypasses dirty-state warnings upon successful HTTP 204 and navigates cleanly back to `/notes`.
> - **Verification Suite:** 93 client tests passing; 56 server tests passing; 0 ESLint errors/warnings; clean production build; 12 real API lifecycle checks passing.
> - **Next Stage:** **Stage 6 — Note Organization and Recovery** (Collections, Tags, Pinning, Favorites, and Trash Restoration).

---

## Local Development Guide (Windows)

### Prerequisites Tested
- **Node.js:** `v22.14.0` (LTS) or higher
- **npm:** `11.6.2` or higher
- **Git:** `2.51.1` or higher

### 1. Installation

Install dependencies for both the backend and frontend in their respective directories:

```powershell
# In terminal 1: Install server dependencies
cd server
npm install

# In terminal 2: Install client dependencies
cd ../client
npm install
```

### 2. Environment Configuration (Optional)

Both applications ship with ready-to-run local defaults. If you need custom port configurations, copy the provided `.env.example` templates:

```powershell
# Server configuration (default PORT: 3000)
Copy-Item server/.env.example server/.env

# Client configuration (default VITE_PORT: 5173, VITE_API_PROXY_TARGET: http://localhost:3000)
Copy-Item client/.env.example client/.env
```

*Note: Variables prefixed with `VITE_` are embedded into public client-side JavaScript. Never store secrets, passwords, or private API keys in client environment files.*

### 3. Running the Applications Locally

Run the backend and frontend in two separate Windows PowerShell terminals:

**Terminal 1 — Backend API:**
```powershell
cd server
npm run dev
```
*Backend runs at: [http://localhost:3000](http://localhost:3000)*  
*Direct health check: [http://localhost:3000/api/health](http://localhost:3000/api/health)*

**Terminal 2 — Frontend Application:**
```powershell
cd client
npm run dev
```
*Frontend runs at: [http://localhost:5173](http://localhost:5173)*

### 4. Database Setup and Verification

See [`docs/LOCAL_DATABASE_SETUP.md`](file:///d:/myNotes/docs/LOCAL_DATABASE_SETUP.md) for full setup instructions. Once your local `server/.env` is configured with discrete `PG*` variables:

```powershell
cd server
npm run db:check           # Verifies connection, target database (mynotes_dev), and schema readiness
npm run db:migrate         # Applies pending version-controlled SQL migrations
npm run db:migrate:status  # Displays applied vs pending migrations
```

*Note: Migrations must be run explicitly via CLI. Automatic migration execution during server startup is strictly avoided to preserve process stability and prevent race conditions.*

### 5. Development Proxy Note
During development, Vite forwards all browser requests starting with `/api` directly to `http://localhost:3000`. This proxy setup is for local development convenience; production deployments will configure reverse proxying (e.g., NGINX) or serve static assets directly from the backend.

### 6. Running Automated Checks

**Backend Automated Tests & Linting:**
```powershell
cd server
npm test        # Runs health and error handling tests with Node native test runner
npm run lint    # Runs ESLint (flat config)
```

**Frontend Linting & Production Build:**
```powershell
cd client
npm run lint    # Runs ESLint with React and React Hooks rules
npm run build   # Validates Vite + Tailwind production bundle generation
```

---

## Project Documentation Index

- [Project Specification](file:///d:/myNotes/docs/PROJECT_SPEC.md): Purpose, target user, module requirements, MVP scope, non-functional requirements, and explicit non-goals.
- [Architecture Design](file:///d:/myNotes/docs/ARCHITECTURE.md): System components, data models, entity relationships, editor JSON/text strategy, and proposed folder structure.
- [Implementation Plan](file:///d:/myNotes/docs/IMPLEMENTATION_PLAN.md): Stage-by-stage development roadmap from Stage 0 through Stage 14 with objectives, tasks, criteria, and exclusions.
- [Development Rules & Engineering Principles](file:///d:/myNotes/docs/DEVELOPMENT_RULES.md): Engineering standards, safety practices, verification expectations, and completion reporting format.
- [Architectural Decisions Log](file:///d:/myNotes/docs/DECISIONS.md): Record of confirmed decisions, unresolved questions, trade-offs, and recommended defaults.
