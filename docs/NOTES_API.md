# MyNotes Notes REST API Specification (Stage 5A)

This document specifies the backend REST API, data validation contract, optimistic concurrency control, and security rules for private notes in MyNotes.

---

## 1. Overview & Security Architecture

The Notes API provides private, ownership-scoped CRUD operations for notes. It strictly adheres to the following principles:

1. **Authentication & Session Binding:** Every request requires an active session authenticated via `express-session` backed by PostgreSQL (`requireAuth`). Unauthenticated requests receive `401 Unauthorized`.
2. **CSRF Protection:** State-changing requests (`POST`, `PATCH`) require a valid session-bound synchronizer token via `X-CSRF-Token` and an approved `Origin` header (`requireCsrf`). Violations receive `403 Forbidden`.
3. **No-Store Caching:** All notes endpoints emit `Cache-Control: no-store, no-cache, must-revalidate, private` and `Pragma: no-cache` to prevent intermediate proxy and browser caching of private note content.
4. **Ownership Scoping & Information Leakage Prevention:** Every database query filters by `user_id = $auth_user_id` and `deleted_at IS NULL`. Queries for foreign or non-existent note IDs uniformly return `404 Not Found` without disclosing record existence.
5. **Foreign Key Policy:** Foreign key constraint `ON DELETE RESTRICT` guarantees that deleting a user account cannot silently cascade or orphan notes without explicit application-level lifecycle handling.

---

## 2. ProseMirror / Tiptap Content Schema & Validation Contract

Rich-text note content (`content_json`) is validated server-side against a strict whitelist reflecting standard ProseMirror / Tiptap documents.

### Strict Document Limits
| Metric | Limit | Description |
| :--- | :--- | :--- |
| **Title Length** | 1 – 200 characters | Trimmed; blank or whitespace-only inputs normalize to `"Untitled note"`. Non-string or >200 characters rejected with `400 Bad Request`. |
| **Max Content Size** | 256 KiB (`262,144` bytes) | Serialized JSON string size in UTF-8 bytes. |
| **Max Tree Depth** | 20 levels | Prevents stack overflows during recursive traversal. |
| **Max Node Count** | 5,000 nodes | Prevents excessive CPU overhead and memory exhaustion. |

### Allowed Node Types
- `doc`: Root node. Content must be an array of block nodes.
- `paragraph`: Standard text container.
- `heading`: Supported attributes: `{ level: 1 | 2 | 3 }`. Levels outside 1–3 are rejected.
- `bulletList`: Container for unordered list items.
- `orderedList`: Container for ordered list items. Supported attributes: `{ start?: number (integer >= 1), type?: string | null }`.
- `listItem`: List item containing block content (paragraphs, nested lists).
- `blockquote`: Quotation block containing block content.
- `codeBlock`: Code snippet. Supported attribute: `{ language?: string | null }` (up to 50 chars). Child text nodes inside code blocks **cannot** have marks.
- `hardBreak`: Line break (`<br>`).
- `horizontalRule`: Divider line (`<hr>`).
- `text`: Leaf text node. Must have a string `text` property.

### Allowed Marks
Text nodes may optionally include marks:
- `bold`
- `italic`
- `strike`
- `code`

*Disallowed elements (e.g. `image`, `table`, `link`, `script`, HTML attributes, raw styling) are strictly rejected with `400 Bad Request`.*

### Plain Text Derivation & Previews
- On creation and update, the server recursively walks `content_json` and extracts leaf text nodes, separating block boundaries with spaces to generate `content_text`.
- For list endpoints, the server derives a bounded preview string: collapses runs of whitespace into a single space, strips leading/trailing whitespace, and truncates to 150 characters with `...` if exceeded.

---

## 3. Endpoints

### 3.1. Create Note
`POST /api/notes`

Creates a new private note for the authenticated user.

- **Headers:**
  - `Content-Type: application/json`
  - `X-CSRF-Token: <token>`
- **Request Body:**
  ```json
  {
    "title": "My Note Title",
    "content": {
      "type": "doc",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Note content goes here." }]
        }
      ]
    }
  }
  ```
  *(If `title` is empty or omitted, defaults to `"Untitled note"`. If `content` is omitted, defaults to an empty document `{"type": "doc", "content": []}`).*
- **Responses:**
  - `201 Created`
    ```json
    {
      "id": "c1f2b6a2-15f1-46ee-86df-5883d65b75ad",
      "title": "My Note Title",
      "content": { "type": "doc", "content": [...] },
      "version": 1,
      "createdAt": "2026-10-26T14:00:00.000Z",
      "updatedAt": "2026-10-26T14:00:00.000Z"
    }
    ```
  - `400 Bad Request`: Invalid JSON, schema validation failure, or unpermitted fields (e.g., attempting to pass client `id` or `version`).
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: CSRF token invalid or missing.
  - `413 Payload Too Large`: Body exceeds 512 KiB or content exceeds 256 KiB.

---

### 3.2. List Notes
`GET /api/notes`

Retrieves a paginated list of active (non-trashed) notes for the authenticated user, sorted by `updated_at DESC, id ASC`.

- **Query Parameters:**
  - `q` *(string, optional)*: Plain-text search query. Case-insensitive match across `title` and `content_text`. SQL wildcards (`%`, `_`, `\`) are escaped and matched literally. Max 200 characters.
  - `limit` *(integer, optional)*: Page size (1 to 100, default: 20).
  - `offset` *(integer, optional)*: Starting offset (>= 0, default: 0).
- **Responses:**
  - `200 OK`
    ```json
    {
      "notes": [
        {
          "id": "c1f2b6a2-15f1-46ee-86df-5883d65b75ad",
          "title": "My Note Title",
          "preview": "Note content goes here.",
          "version": 1,
          "createdAt": "2026-10-26T14:00:00.000Z",
          "updatedAt": "2026-10-26T14:00:00.000Z"
        }
      ],
      "items": [
        {
          "id": "c1f2b6a2-15f1-46ee-86df-5883d65b75ad",
          "title": "My Note Title",
          "preview": "Note content goes here.",
          "version": 1,
          "createdAt": "2026-10-26T14:00:00.000Z",
          "updatedAt": "2026-10-26T14:00:00.000Z"
        }
      ],
      "total": 1,
      "limit": 20,
      "offset": 0,
      "hasMore": false
    }
    ```
  - `400 Bad Request`: Negative offset, non-integer limit, or search query exceeding 200 characters.
  - `401 Unauthorized`: Unauthenticated.

---

### 3.3. Get Note By ID
`GET /api/notes/:id`

Retrieves the full note document and content for a given note.

- **Parameters:**
  - `id` *(UUID string in path)*: Note unique identifier.
- **Responses:**
  - `200 OK`
    ```json
    {
      "id": "c1f2b6a2-15f1-46ee-86df-5883d65b75ad",
      "title": "My Note Title",
      "content": { "type": "doc", "content": [...] },
      "version": 1,
      "createdAt": "2026-10-26T14:00:00.000Z",
      "updatedAt": "2026-10-26T14:00:00.000Z"
    }
    ```
  - `400 Bad Request`: Malformed UUID.
  - `401 Unauthorized`: Unauthenticated.
  - `404 Not Found`: Note does not exist, belongs to another user, or has been trashed.

---

### 3.4. Update Note (Optimistic Concurrency)
`PATCH /api/notes/:id`

Updates the note title and/or rich-text content. Requires `expectedVersion` matching the current database version.

- **Headers:**
  - `Content-Type: application/json`
  - `X-CSRF-Token: <token>`
- **Request Body:**
  ```json
  {
    "title": "Updated Note Title",
    "content": {
      "type": "doc",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Updated content text." }]
        }
      ]
    },
    "expectedVersion": 1
  }
  ```
- **Responses:**
  - `200 OK`
    ```json
    {
      "id": "c1f2b6a2-15f1-46ee-86df-5883d65b75ad",
      "title": "Updated Note Title",
      "content": { "type": "doc", "content": [...] },
      "version": 2,
      "createdAt": "2026-10-26T14:00:00.000Z",
      "updatedAt": "2026-10-26T14:05:00.000Z"
    }
    ```
  - `400 Bad Request`: Malformed UUID, missing/invalid `expectedVersion`, or invalid content schema.
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: CSRF token invalid.
  - `404 Not Found`: Note does not exist, belongs to another user, or is in trash.
  - `409 Conflict`:
    ```json
    {
      "error": "Conflict",
      "code": "NOTE_VERSION_CONFLICT",
      "message": "Note has been modified by another process."
    }
    ```

---

### 3.5. Soft-Delete Note (Trash)
`POST /api/notes/:id/trash`

Moves an active note to the trash by setting `deleted_at = NOW()` and atomically incrementing `version`. Requires `expectedVersion`.

- **Headers:**
  - `Content-Type: application/json`
  - `X-CSRF-Token: <token>`
- **Request Body:**
  ```json
  {
    "expectedVersion": 2
  }
  ```
- **Responses:**
  - `204 No Content`: Note moved to trash. Subsequent `GET` requests return `404 Not Found`.
  - `400 Bad Request`: Malformed UUID, or missing/invalid `expectedVersion`.
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: CSRF token invalid.
  - `404 Not Found`: Note does not exist, belongs to another user, or is already in trash.
  - `409 Conflict`: `NOTE_VERSION_CONFLICT` if `expectedVersion` is stale.

---

## 4. Concurrency & Mutation Semantics

### Atomic Versioning
Every note row has an integer column `version` starting at `1`.
When updating or trashing, the backend performs:
```sql
UPDATE notes
SET
  title = $1,
  content_json = $2,
  content_text = $3,
  version = version + 1,
  updated_at = NOW()
WHERE id = $4
  AND user_id = $5
  AND deleted_at IS NULL
  AND version = $6
RETURNING id, title, content_json, version, created_at, updated_at;
```
If `rowCount === 0`, a secondary query checks if the note exists and is owned by the user. If so, a `409 Conflict` (`NOTE_VERSION_CONFLICT`) is returned, notifying the client that another process updated the note. If the note does not exist or belongs to another user, `404 Not Found` is returned.

---

## 5. Automated Verification

### Server Unit & Route Test Suite
To run all 55 backend unit and route tests:
```powershell
cd server
npm test
```

### PostgreSQL Integration Check
To execute the live PostgreSQL integration verification (verifying table structure, 2 isolated users, cross-user read/write isolation, concurrent version resolution, literal wildcards, trash deletion, and foreign key restriction):
```powershell
cd server
node test/integrationCheck.js
```

### Code Quality / Linting
```powershell
cd server
npm run lint
```

---

## 6. Client-Side Manual Save Model & Concurrency Architecture (Stage 5 Stabilization)

In the Stage 5 stabilization pass, automatic background autosave was completely removed by user decision following issues with fluctuating save indicators. The editor operates on a pure explicit manual save model:

1. **Explicit Save Triggers Only:**
   - **Save Button:** Clicking the "Save note" button.
   - **Keyboard Shortcut:** Pressing `Ctrl+S` (Windows/Linux) or `Cmd+S` (macOS), which intercepts and cancels the browser's default "Save Page" dialog (`e.preventDefault()`).
   - Typing, pausing, blurring inputs, router transitions, and component unmounts **never** send automatic PATCH requests.

2. **In-Flight Save Freeze:**
   - When a manual save is initiated (`isSaving = true`), the editor is put into read-only mode (`editable={false}`), input controls and formatting toolbar buttons are disabled, and the Save button displays "Saving...".
   - This enforces clear transactional boundaries and prevents interleaving unsaved keystrokes with the in-flight server payload.
   - Once the server responds, input controls are immediately restored to fully editable mode.

3. **Key-Order-Agnostic Baseline Comparison (`deepEqual`):**
   - The editor uses a recursive structural equality check (`deepEqual`) and content normalization (`normalizeEditorContent`) instead of string comparison, eliminating false dirty states caused by ProseMirror JSON attribute key ordering or serialization subtleties.
   - Initial load calls `commands.setContent(loadedContent, { emitUpdate: false })` to prevent spurious `onUpdate` events during note initialization.

4. **Error Handling & Failure Recovery:**
   - **409 Conflict (`NOTE_VERSION_CONFLICT`):** Retains the local draft in memory, displays a conflict banner, and provides "Copy local draft" (with clipboard and manual textarea fallback) and a confirmed "Discard and reload latest" action.
   - **401 Unauthorized (`UNAUTHENTICATED`):** Retains the local draft in memory, alerts the user that the session has expired, and provides draft copy and login links.
   - **400 / 413 Validation Errors:** Retains local draft in memory, shows the validation error, and allows the user to correct the draft and save again.
   - **5xx / Network Errors:** Marks status as `Save failed`, preserves the local draft in memory, restores input editing, and enables an explicit "Retry" action with the confirmed `expectedVersion`.
   - *(Note: In-memory drafts are retained during the active session. If the user closes or refreshes the browser tab, the draft is subject to browser memory lifecycle and is not written to offline disk storage).*

5. **Router Navigation Blocking & Shell Logout Coordination:**
   - Powered by React Router v7 Data Routers (`createBrowserRouter`, `RouterProvider`) with native `useBlocker` when `isDirty` is true.
   - Intercepts in-app links and browser Back/Forward navigation, prompting the user with a modal offering "Stay" vs "Discard changes and leave".
   - `AppLayout` checks dirty state via React Router outlet context before executing shell logout, prompting the user to confirm discarding changes before the session is destroyed on the backend.
   - Trashing a note bypasses dirty warnings upon HTTP 204 and navigates cleanly to `/notes`.
