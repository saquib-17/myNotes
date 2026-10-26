# MyNotes — System Architecture

This document describes the architectural foundation, component boundaries, entity models, and storage strategies for MyNotes.

---

## 1. System Responsibilities

### 1.1 Frontend (React + Vite + Tailwind CSS)
- **Role:** Single Page Application (SPA) providing an interactive, responsive user experience.
- **Responsibilities:**
  - Rendering views, responsive shell navigation, and modal dialogues.
  - Rich-text editing via headless Tiptap and syntax-highlighted code blocks.
  - Client-side routing, optimistic UI updates where appropriate, and state handling.
  - Management of visual states: `Loading`, `Empty`, `Saving`, `Saved`, and `Error`.
  - Managing file selection, upload progress, and document preview rendering (PDF and images).
  - Calling backend REST APIs with proper session credentials.

### 1.2 Backend (Node.js + Express)
- **Role:** RESTful API server handling business logic, data validation, and authorization.
- **Responsibilities:**
  - Enforcing authentication and session security.
  - Authorizing every read, write, download, and delete request by verifying entity ownership.
  - Input validation, sanitization, and structured error responses.
  - Parameterized database interaction through the Node.js `pg` driver.
  - Handling file uploads securely: checking MIME types, file size limits, generating collision-free disk identifiers, and streaming files to private storage.
  - Generating extracted plain-text from Tiptap JSON payloads to maintain search indexes.
  - Executing database schema migrations.

### 1.3 Database (PostgreSQL)
- **Role:** Single source of truth for all structured entities, relationships, and metadata.
- **Responsibilities:**
  - Relational consistency via primary keys, foreign keys, and cascading constraints where appropriate.
  - Storing structured rich-text content using `JSONB` for Tiptap documents.
  - Maintaining indexed plain-text fields (`TEXT`) alongside `JSONB` for fast text searches.
  - Storing file metadata (original filename, MIME type, storage path/key, file size).
  - Enforcing transaction boundaries on multi-entity operations.

### 1.4 Private File Storage
- **Role:** Private file persistence isolated from public web access.
- **Responsibilities:**
  - Development / Local Environment: Stored in a secured, non-public directory on the server filesystem.
  - Production (Future): Swappable storage adapter for private S3-compatible object storage.
  - Security Guarantee: Files are never served directly via public URL paths. Every file retrieval requires an authenticated API request with explicit ownership verification before streaming bytes to the client.

---

## 2. Text Architecture Diagram

```
+-------------------------------------------------------------------------+
|                              CLIENT BROWSER                             |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                 React Application (Vite + Tailwind)                |  |
|  |                                                                   |  |
|  |  +-------------------+  +-------------------+  +---------------+  |  |
|  |  | App Shell & Views |  |  Tiptap Editor    |  | File Previews |  |  |
|  |  +-------------------+  +-------------------+  +---------------+  |  |
|  +-------------------------------------------------------------------+  |
+------------------------------------▲------------------------------------+
                                     │ HTTP / REST APIs (JSON / Multipart)
                                     │ Authenticated Cookies or Auth Headers
+------------------------------------▼------------------------------------+
|                         BACKEND APPLICATION (Node.js)                   |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                 Express Server & Middleware Pipeline              |  |
|  |                                                                   |  |
|  |  [CORS / Security] -> [Auth Middleware] -> [Ownership Validator]  |  |
|  +-------------------------------------------------------------------+  |
|                                    │                                    |
|  +---------------------------------▼---------------------------------+  |
|  |                          Module Controllers                       |  |
|  |   - Auth        - Notes & Collections    - Question Bank          |  |
|  |   - Documents   - Tasks & Planner        - Workspaces             |  |
|  |   - Inbox       - Revision & Doubts      - Journal & Dashboard    |  |
|  +-------------------------------------------------------------------+  |
|                  │                                    │                 |
|                  ▼ (Parameterized SQL)                ▼ (Stream Bytes)  |
|  +-------------------------------+    +-------------------------------+ |
|  |     pg Driver Connection      |    |    Private Storage Service    | |
|  +-------------------------------+    +-------------------------------+ |
+------------------│------------------------------------│-----------------+
                   │                                    │
                   ▼                                    ▼
+------------------------------------+  +---------------------------------+
|        PostgreSQL Database         |  |      Private File Storage       |
|                                    |  |                                 |
|  - Relational Tables & Indices     |  |  - Local disk folder (Dev)      |
|  - Notes (JSONB content + text)    |  |  - S3 / Object Store (Future)   |
|  - File Metadata & Relationships   |  |  - No public direct access      |
+------------------------------------+  +---------------------------------+
```

---

## 3. Proposed Future Folder Structure

*(Note: Proposed design only; no source code files are created during Stage 0.)*

```
myNotes/
├── docs/                       # Project documentation and specifications
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── DEVELOPMENT_RULES.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── PROJECT_SPEC.md
├── client/                     # Frontend application (React + Vite)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api/                # HTTP API client wrappers
│       ├── components/         # Shared UI components (Modals, Inputs, Buttons)
│       │   ├── editor/         # Tiptap rich-text editor components
│       │   ├── layout/         # Sidebar, Header, Breadcrumbs, AppShell
│       │   └── feedback/       # Loading spinners, Error boundaries, Empty states
│       ├── features/           # Feature modules
│       │   ├── notes/
│       │   ├── questions/
│       │   ├── documents/
│       │   ├── tasks/
│       │   ├── inbox/
│       │   ├── workspaces/
│       │   ├── revision/
│       │   └── journal/
│       ├── hooks/              # Custom React hooks (e.g., useAutosave, useAuth)
│       └── utils/              # Client-side utility functions
├── server/                     # Backend application (Node.js + Express)
│   ├── package.json
│   ├── src/
│   │   ├── app.js              # Express app configuration
│   │   ├── server.js           # Server entry point and listener
│   │   ├── config/             # Environment configuration & DB connection pool
│   │   ├── db/                 # Database initialization and pg helpers
│   │   │   ├── migrations/     # Version-controlled SQL migration files
│   │   │   └── migrate.js      # Migration runner
│   │   ├── middleware/         # Auth, ownership, validation, error handler
│   │   ├── modules/            # Feature-specific routes, controllers, and services
│   │   │   ├── auth/
│   │   │   ├── notes/
│   │   │   ├── questions/
│   │   │   ├── documents/
│   │   │   ├── tasks/
│   │   │   ├── inbox/
│   │   │   ├── workspaces/
│   │   │   ├── revision/
│   │   │   └── journal/
│   │   ├── storage/            # Local/S3 storage abstraction
│   │   └── utils/              # Server helpers (text extractor, sanitizer)
│   └── storage_data/           # Git-ignored local private upload destination
├── .gitignore
└── README.md
```

---

## 4. Entity-Level Data Model & Relationships

The application revolves around 10 primary entity domains linked relationally:

```
                  +-------------------+
                  |       User        |
                  +---------+---------+
                            | 1:N
        +-------------------+--------------------+--------------------+
        |                   |                    |                    |
        ▼                   ▼                    ▼                    ▼
+---------------+   +---------------+    +---------------+    +---------------+
|  Collection   |   |     Note      |    |   Question    |    |   Document    |
+-------+-------+   +-------+-------+    +-------+-------+    +-------+-------+
        |                   |                    |                    |
        | 1:N               | N:M                | N:M                | N:M
        +---------+         +----------+---------+----------+         |
                  |                    |                    |         |
                  ▼                    ▼                    ▼         ▼
          +---------------+    +----------------------------------------------+
          |     Task      |    |            Workspace (Topic Hub)             |
          +---------------+    +----------------------------------------------+
                  |                                 |
                  ▼                                 ▼
          +---------------+                 +---------------+
          |  Doubt / Rev  |                 | Journal Entry |
          +---------------+                 +---------------+
```

### Entity Overviews

1. **User:**
   - Identity, credential hash, session timestamps, and user settings.
2. **Collection:**
   - Hierarchical folders (parent/child) used to categorize Notes.
3. **Note:**
   - Title, `content_json` (Tiptap ProseMirror document stored in `JSONB`), `content_text` (extracted plain text for search), `collection_id` (nullable), flags (`is_pinned`, `is_favorite`, `is_archived`, `is_trashed`), timestamps.
4. **Tag & EntityTag:**
   - Standardized tags linked many-to-many across Notes, Questions, and Documents.
5. **Question:**
   - Prompt, answer, code examples, topic, difficulty (`Easy`, `Medium`, `Hard`), importance (`Low`, `Medium`, `High`), understanding status (`New`, `Learning`, `Mastered`), next review date, interval.
6. **QuestionReviewLog:**
   - Historical record of user reviews: `rating` (`Forgot`, `Partial`, `Confident`), reviewed timestamp, previous interval, new interval.
7. **Document:**
   - Original filename, stored filename / storage key, MIME type, byte size, custom description, uploaded timestamp.
8. **Task:**
   - Title, description/checklist, priority (`Low`, `Medium`, `High`, `Urgent`), status (`Todo`, `In Progress`, `Blocked`, `Done`), due date, linked note/document ID.
9. **Workspace:**
   - Named context hub (e.g., "Full-Stack System Design") that groups related entities together via reference junction tables.
10. **WorkspaceItem (Junction):**
    - Links a Workspace to a Note, Question, Document, or Task without duplicating data.
11. **Doubt:**
    - Concept or question needing clarification, status (`Unresolved`, `Investigating`, `Resolved`), source note reference, resolution note reference.
12. **JournalEntry:**
    - Daily log date, daily summary, reflections, linked reviews, and tasks completed on that date.
13. **InboxItem:**
    - Raw captured snippet, type hint (`note`, `task`, `question`, `link`), status (`unprocessed`, `converted`, `discarded`).

---

## 5. Rich-Text & Document Storage Strategy

### 5.1 Tiptap JSON and Plain-Text Dual Representation
- **Why Tiptap JSON in JSONB?**
  - Tiptap uses ProseMirror's structured JSON schema. Storing the tree in a PostgreSQL `JSONB` column maintains strict formatting, inline marks, code block metadata, and attributes without HTML parsing quirks or brittle string escaping.
- **Search Optimization via Plain-Text Extraction:**
  - `JSONB` alone is inefficient for sub-string or full-text linguistic matching.
  - On every save/update, the backend extracts the clean, unformatted plain-text string from the Tiptap JSON payload and saves it into a dedicated `content_text TEXT` column.
  - Full-text search and keyword filters operate against `content_text`, while the editor UI loads and renders `content_json`.

### 5.2 Private File Storage vs. Database Metadata
- File binary bytes are **never** stored inside PostgreSQL `BYTEA` columns to avoid database bloat and memory pressure.
- Files are saved directly to a dedicated private storage disk location (or S3-compatible bucket in future stages).
- Only file metadata is maintained in PostgreSQL (`id`, `user_id`, `original_name`, `storage_path`, `mime_type`, `size_bytes`, `created_at`).
- All downloads and previews are streamed through authenticated endpoints:
  `GET /api/documents/:id/download` and `GET /api/documents/:id/preview`.

---

## 6. Open Decisions and Trade-Offs

1. **Authentication Session Strategy:**
   - *Option A:* HTTP-only, SameSite secure session cookies backed by a database session store.
   - *Option B:* Short-lived JWTs stored in memory with HTTP-only refresh cookies.
   - *Trade-off:* Session cookies in PostgreSQL are straightforward to revoke and inspect, with minimal client-side token management logic. Recommended for an early personal-use monolith.
2. **Database Migration Runner (Confirmed):**
   - *Confirmed Tool:* `node-pg-migrate` running version-controlled raw `.sql` migration files.
   - *Rationale:* Plain SQL migrations (`.sql` files) maintain direct transparency, eliminate ORM lock-in, integrate cleanly with `pg`, and avoid automatic startup execution hazards.
3. **Local File Storage Path Structure:**
   - Storing uploaded files by UUID (`/storage_data/<uuid>.<ext>`) to avoid filename collision, directory traversal vulnerabilities, and special character issues.
