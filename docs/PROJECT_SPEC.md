# MyNotes — Project Specification

## 1. Purpose and Target User

### 1.1 Purpose
MyNotes is a knowledge-first personal workspace designed to support learners, developers, and thinkers who need a focused environment to:
- Take structured, rich-text notes with code blocks.
- Collect and master critical interview and conceptual questions.
- Store reference documents and media safely with private access.
- Manage daily activities, tasks, and deadlines linked directly to study material.
- Review and retain acquired knowledge using deliberate practice and reflective journaling.

### 1.2 Target User
A self-directed learner, student, or technical professional who values deep work, organized knowledge retention, and actionable task management. The user needs an uncluttered, dependable system that bridges the gap between passive note-taking and active recall.

---

## 2. Core User Journeys

The application is structured around a continuous learning loop:

1. **Capture (Inbox):**
   - The user comes across a concept, code snippet, bug fix, interview question, PDF paper, or task.
   - They quickly record it into the Quick-Capture Inbox without worrying about taxonomy, categorization, or folder nesting.

2. **Organize (Notes & Collections):**
   - In periodic triage, the user converts inbox items into formal notes, questions, tasks, or documents.
   - Notes are assigned to hierarchical collections, tagged, pinned, or favorited.

3. **Connect (Topic & Project Workspaces):**
   - The user creates or opens a Topic Workspace (e.g., "PostgreSQL Indexing" or "System Design Prep").
   - They reference existing notes, question items, reference PDFs, and action items in one unified dashboard view without duplicating data.

4. **Act (Tasks & Daily Planner):**
   - Daily activities are scheduled and prioritized across Today, Upcoming, and Overdue views.
   - Every task can link directly to a note or workspace so the user doesn't lose context.

5. **Review (Revision, Self-Testing & Journal):**
   - The user opens the Question Bank in **Self-Test Mode** (answers hidden) to test understanding.
   - Ratings (Forgot / Partial / Confident) adjust the review schedule deterministically.
   - The user logs daily achievements, blockers, and weekly summaries in the Journal.

---

## 3. Modules and Functional Scope

### Module 1: Notes and Documentation
- **Rich-Text Editing:** Headings, lists, blockquotes, inline formatting, tables, and links.
- **Code Blocks:** Syntax-highlighted code blocks with language indicators.
- **Organization:** Hierarchical collections/notebooks, multi-tag assignment, favorites, and pinned notes.
- **Editor State & Autosave:** Continuous autosave with explicit status indicator (`Unsaved`, `Saving...`, `Saved at HH:mm`, `Error saving`).
- **Lifecycle & Safety:** Soft-deletion (Trash/Archive) with recovery and permanent purge safeguards.
- *Later Release:* Note revision history, full version diffing, and export (Markdown/HTML/PDF).

### Module 2: Important-Question Bank
- **Knowledge Cards:** Question prompt, detailed answer, code examples, external references, and supporting notes.
- **Taxonomy:** Topic/Subject categorization, difficulty level (Easy, Medium, Hard), priority/importance rating, and mastery status (New, Learning, Mastered).
- **Self-Test Mode:** Interactive practice view where the answer and examples are obscured until explicitly revealed by the user.
- **Relational Links:** Direct references to relevant notes, uploaded documents, or workspaces.
- **History:** Chronological log of review attempts and self-ratings.

### Module 3: Document Library
- **Private File Storage:** Strictly authenticated uploads and downloads; files are stored privately on disk (or object storage), never exposed via public directory browsing.
- **Supported Formats:** PDF documents, common images (PNG, JPEG, WebP), and markdown/text files.
- **Previews:** In-app visual preview for supported PDFs and images.
- **Metadata:** Title, file size, MIME type, upload timestamp, custom description, and tags.
- **Cross-References:** Attach or link documents to notes, question cards, and workspaces.
- *Later Release:* Background text extraction, full-text search across document contents, and OCR.

### Module 4: Tasks and Daily Planner
- **Task Management:** Titles, descriptions, subtask checklists, priority tiers (Low, Medium, High, Urgent), due dates, and statuses (Todo, In Progress, Blocked, Done).
- **Views:** Dedicated filters for `Today`, `Upcoming`, `Overdue`, and `Completed`.
- **Knowledge Anchoring:** One-click navigation from any task to its associated note, document, or workspace.
- *Later Release:* Recurring activity schedules and external notification integrations.

### Module 5: Quick-Capture Inbox
- **Frictionless Entry:** Single modal or hotkey interface to capture raw text, thoughts, URLs, snippets, or draft tasks.
- **Item Conversion:** One-click conversion from an inbox item into a formal Note, Question Card, Document stub, or Task.
- **Triage Workflow:** Filter by untriaged items, bulk assign tags, or archive processed items.

### Module 6: Connected Topic / Project Workspaces
- **Context Hubs:** Aggregated workspaces (e.g., "Full-Stack Node.js Study", "Distributed Systems").
- **Reference-Based Architecture:** Workspaces reference primary entity IDs (notes, questions, documents, tasks) rather than cloning or duplicating content.
- **Workspace Views:** Kanban-style or categorized dashboard showing all knowledge assets and open action items in one place.

### Module 7: Revision and Doubt Tracking
- **Review Queue:** Automated list of questions and concepts due for review based on transparent, deterministic intervals.
- **Self-Rating Inputs:** Standardized rating triggers (`Forgot`, `Partial`, `Confident`) that compute next review dates.
- **Doubt Lifecycle:** Dedicated tracking for unresolved doubts (`Unresolved`, `Investigating`, `Resolved`), linked to the note where the doubt originated and the resolution note.

### Module 8: Journal and Dashboard
- **Daily Dashboard:** Aggregated glance at top daily priorities, items due for review, recently modified notes, and active doubts.
- **Daily Logs:** Structured daily markdown/rich-text entry for recording what was learned, obstacles, and wins.
- **Weekly Review:** Retrospective template summarizing task completion, study volume, and focus areas for the upcoming week.

### Module 9: Optional Advanced AI (Deferred to Later Phase)
- **Scoped Querying:** Ability to query only user-selected notes and documents.
- **Grounded Responses:** Every AI-generated statement must include clickable source citations pointing to the user's notes.
- **Study Aids:** Draft suggested test questions or summaries from selected notes.
- **Strict Boundaries:** Clear visual differentiation between user-authored content and synthetic content; zero outbound transmission of private data without explicit opt-in.

---

## 4. MVP Scope vs. Later Releases

| Feature Area | MVP (Stages 1 – 13) | Later Releases (Stage 14+) |
|---|---|---|
| **Notes** | Tiptap rich-text, code blocks, collections, tags, autosave, trash/restore, plain-text search | Note version history diffing, multi-format bulk export |
| **Questions** | Question bank, tags, self-test answer reveal, self-ratings, review log | Automated Leitner box algorithms, complex statistics |
| **Documents** | Private upload/download, metadata, tags, PDF/image preview, file linking | OCR, deep text extraction inside binary files |
| **Tasks** | Tasks, subtasks, priorities, due dates, Today/Upcoming/Overdue views | Recurring task engine, external calendar sync |
| **Inbox** | Fast modal capture, conversion to Note/Question/Task/Document | Browser extension quick-clipper |
| **Workspaces** | Topic hubs referencing existing entities without duplication | Custom widget layouts, shared workspace templates |
| **Revision** | Deterministic interval queue, Doubt status tracking | Machine-learning adaptive scheduling |
| **Storage** | Secure local filesystem storage with path isolation | S3 / MinIO private object storage adapter |
| **AI** | None (explicitly excluded from initial build) | Source-grounded RAG, AI-assisted practice question drafting |

---

## 5. Non-Functional Requirements

1. **Privacy & Access Control:**
   - All user data, notes, and uploaded documents are private by default.
   - Every read, write, download, and delete request must verify user identity from an authenticated session and check entity ownership.
2. **Reliability & Data Integrity:**
   - Robust autosave mechanism that prevents silent data loss or race-condition overwrites.
   - Parameterized database queries to completely prevent SQL injection.
   - Database operations that alter multiple records must run within atomic transactions.
3. **Transparent UI States:**
   - Every asynchronous interaction must reflect one of five explicit states:
     `Loading`, `Empty (with helpful placeholder/action)`, `Saving`, `Saved / Success`, or `Error (with recovery guidance)`.
4. **Accessibility (a11y):**
   - High-contrast, semantic HTML structure, keyboard navigable forms and modals, and proper ARIA labels for icon buttons and editor controls.
5. **Responsive Layout:**
   - Desktop-first workspace with collapsible sidebars and responsive layout that functions cleanly on tablets and mobile devices.
6. **Recoverability:**
   - Soft-delete pattern for notes, collections, and documents to prevent accidental data loss.
   - Explicit confirmation dialogs before any permanent purge operations.

---

## 6. Explicit Non-Goals

- **No Multi-Tenant SaaS Complexities:** The system is built for single-user personal empowerment or individual self-hosted accounts.
- **No Real-Time Google Docs-Style Collaboration:** No operational transform (OT) or CRDT websocket infrastructure; concurrent multi-user editing on a single note is not in scope.
- **No Dual Database Engine:** MongoDB will not be paired with PostgreSQL. PostgreSQL serves all structured and JSON document needs.
- **No Early TypeScript Migration:** The code will be written in standard, clean JavaScript (ESModules) to keep velocity high and align with user learning goals.
- **No Distributed Microservices:** No Kafka, RabbitMQ, Docker swarm, or Kubernetes in the core architecture.
- **No Preemptive Cloud Lock-in:** The core application must be runnable entirely locally on Node.js + PostgreSQL.
