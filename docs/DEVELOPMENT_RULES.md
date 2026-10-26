# MyNotes — Development Rules and Engineering Principles

This document establishes the development standards, security invariants, scope boundaries, and completion reporting requirements for MyNotes. Every contributor and agent working on this codebase must strictly adhere to these rules.

---

## 1. Core Engineering Principles

1. **One Scoped Task at a Time:**
   - Focus exclusively on the current stage and approved task.
   - Do not bundle unrelated refactorings, premature optimizations, or speculative features into active work.
2. **Inspect Before Modifying:**
   - Inspect existing files, schemas, and configurations before altering them.
   - Respect established conventions, naming schemes, and directory layouts.
3. **Preserve Working Functionality:**
   - Never break an existing passing test or working user flow to introduce a new feature.
   - Run verification checks to confirm baseline integrity before and after changes.
4. **Transparent Dependency Management:**
   - Explain the justification, bundle impact, and alternatives before introducing any third-party dependency.
   - Keep dependencies minimal, secure, and actively maintained.
5. **Secrets and Environment Hygiene:**
   - Never commit API keys, database passwords, session secrets, or production URLs into version control.
   - Maintain `.env.example` templates with non-secret dummy placeholders.
   - Ensure `.gitignore` reliably excludes `.env`, `node_modules`, and storage directories.
6. **Robust Server-Side Validation:**
   - Client-side validation is for UX only. The server must validate every payload (types, lengths, ranges, and formats).
   - Use strict parameterized SQL queries via `pg` (`$1, $2, ...`) without exception. Never concatenate or interpolate user input into SQL strings.
7. **Session-Driven Identity and Ownership:**
   - Determine user identity exclusively from the authenticated session, never from untrusted request bodies or query parameters.
   - Verify ownership on **every** read, write, download, update, and delete operation (`WHERE id = $1 AND user_id = $2`).
8. **Private File Storage Invariant:**
   - Keep user uploads isolated in private storage.
   - Enforce server-side MIME-type verification and maximum byte size limits.
   - Serve files exclusively through authenticated streaming endpoints that check ownership.
9. **Untrusted Rich-Text Handling:**
   - Treat rich-text and Tiptap JSON content as untrusted input.
   - Sanitize content before rendering or extracting plain text to prevent stored XSS vulnerabilities.
10. **Explicit UI State Transparency:**
    - Never leave the user guessing. Every dynamic view must handle and explicitly display:
      - `Loading`: visual spinner or skeleton.
      - `Empty`: helpful explanation and primary action trigger.
      - `Saving`: unambiguous indicator that an operation is in flight.
      - `Saved`: clear feedback of successful save with timestamp.
      - `Error`: actionable error message and retry mechanism.
11. **Data Loss and Overwrite Prevention:**
    - Autosave must be debounced and protected against race conditions.
    - Provide soft-delete safeguards for destructive actions.
12. **Continuous Testing and Honest Verification:**
    - Write unit or integration tests alongside feature code.
    - Clearly distinguish between:
      - **Executed checks:** Commands that were actually run and their real outputs.
      - **Suggested checks:** Commands recommended for the user or manual testing.
      - **Blocked checks:** Checks that could not be run due to missing environment or dependencies.
    - **Never** claim a test passed unless it was executed and exited with code 0.
13. **Safety Checkpoints & Explicit Approval:**
    - Always ask before destructive actions (dropping tables, deleting directories, overwriting non-empty files).
    - Do not automatically transition to the next stage. Stop and report at each stage boundary.

---

## 2. Architectural & Technical Boundaries

Be mindful of critical real-world distinctions:
- **Autosave is not backup:** Continuous saving persists the latest working state; it does not replace point-in-time snapshots or database backups.
- **Metadata search is not document-content search:** Searching document titles and tags in PostgreSQL does not search the internal text of binary PDFs or images until OCR/extraction is explicitly implemented.
- **A browser timer is not a background reminder service:** `setTimeout` in a browser tab stops when the tab is closed or backgrounded. True reminders require persistent database records and server-side scheduling.
- **Offline editing is not multi-device sync:** Storing drafts in `localStorage` allows single-device recovery, but full cross-device synchronization requires conflict resolution strategies.
- **Personal-use applications still require access controls:** Deploying an application to any network exposes it to unauthorized access unless authentication and authorization are enforced from day one.

---

## 3. Scope Control Rules

- Stick to the approved tech stack: React + Vite + Tailwind CSS (frontend), Node.js + Express + `pg` (backend), PostgreSQL (database).
- Reject out-of-scope additions:
  - Do not add MongoDB alongside PostgreSQL.
  - Do not introduce TypeScript in the initial stages.
  - Do not introduce Redis or vector databases without an approved requirement.
  - Do not introduce Python or Flask until a heavy processing workload is formally justified.
  - Do not add AI integrations or dependencies to the foundational stages.

---

## 4. Safe Change Practices

- Always run `git status` or directory inspection before starting any task.
- Check for existing files before creating new ones to prevent unintended overwrites.
- Test small incremental changes rather than monolithic, multi-file rewrites.
- Ensure all automated tests run and pass before declaring a task complete.

---

## 5. Stage Completion Report Format

At the conclusion of any stage, produce a structured completion report covering these items:

1. **Workspace & Environment State:** Summary of existing directory state, uncommitted changes, and active branches.
2. **Files Created or Modified:** Complete list of relative file paths with brief notes on changes.
3. **Tasks Completed:** Bulleted list mapping directly to the stage's accepted tasks.
4. **Verification & Test Results:**
   - *Executed:* Exact test commands run and their output.
   - *Suggested:* Manual tests recommended for user verification.
   - *Blocked:* Any checks that could not be run and the specific reason.
5. **Open Decisions & Technical Notes:** Any emerging choices requiring user direction.
6. **Requirements for Next Stage:** Specific prerequisites needed before starting the next stage.
7. **Suggested Git Commit Message:** A concise, conventional commit message for the completed work.
8. **Explicit Stop:** Halting execution and waiting for user direction before proceeding.
