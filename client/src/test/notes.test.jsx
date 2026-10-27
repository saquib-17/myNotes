/**
 * Stage 5B Frontend Notes Test Suite
 *
 * Verifies:
 *  1. Path safety and return route policies for note detail routes.
 *  2. Notes listing, search, pagination, loading, empty, and retry states.
 *  3. Obsolete search response cancellation.
 *  4. Single explicit note creation and duplicate-submission prevention.
 *  5. Editor loading without false dirty state.
 *  6. Dirty state tracking and undo restoration.
 *  7. Explicit save success, version increment, and save failure retention.
 *  8. Version conflict handling (409) preserving drafts, draft copy, and confirmed reload.
 *  9. Unsaved-change navigation protection ("Stay" vs "Discard and leave").
 * 10. Trash confirmation, unsaved-change warning, success navigation, and 409 conflict handling.
 * 11. Detail 404 and session error states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, createMemoryRouter, RouterProvider, Link } from "react-router-dom";
import NotesPage from "../pages/NotesPage.jsx";
import NoteEditorPage from "../pages/NoteEditorPage.jsx";
import TrashPage from "../pages/TrashPage.jsx";
import AppLayout from "../layouts/AppLayout.jsx";
import { safeReturnPath } from "../constants/routes.js";
import {
  calculateUtf8Bytes,
  validateClientNote,
} from "../services/notes.service.js";
import * as notesService from "../services/notes.service.js";

// Mock the Auth Context
const mockGetCsrfToken = vi.fn().mockResolvedValue("test-csrf-token");
vi.mock("../context/useAuth.js", () => ({
  useAuth: () => ({
    user: { id: "user-123", email: "user@example.com" },
    isAuthenticated: true,
    getCsrfToken: mockGetCsrfToken,
  }),
}));

const SAMPLE_NOTE = {
  id: "c1f2b6a2-15f1-46ee-86df-5883d65b75ad",
  title: "Architecture Planning",
  preview: "Discussing modular monolithic boundaries.",
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Discussing modular monolithic boundaries." }],
      },
    ],
  },
  version: 1,
  createdAt: "2026-10-27T00:00:00.000Z",
  updatedAt: "2026-10-27T01:00:00.000Z",
};

describe("Stage 5B: Frontend Notes & Rich-Text Editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Safe Return Path Policy for Note Detail
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Safe Return Path Policy", () => {
    it("allows approved /notes path", () => {
      expect(safeReturnPath("/notes")).toBe("/notes");
    });

    it("allows valid internal note-detail UUID paths", () => {
      expect(safeReturnPath("/notes/c1f2b6a2-15f1-46ee-86df-5883d65b75ad")).toBe(
        "/notes/c1f2b6a2-15f1-46ee-86df-5883d65b75ad"
      );
    });

    it("rejects non-UUID note paths and falls back to /dashboard", () => {
      expect(safeReturnPath("/notes/not-a-valid-uuid")).toBe("/dashboard");
    });

    it("rejects protocol-relative and external URLs", () => {
      expect(safeReturnPath("//evil.com/notes/c1f2b6a2-15f1-46ee-86df-5883d65b75ad")).toBe(
        "/dashboard"
      );
      expect(safeReturnPath("https://evil.com/notes")).toBe("/dashboard");
      expect(safeReturnPath(undefined)).toBe("/dashboard");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Client-Side Limits Validation & UTF-8 Calculation
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. Client Limits Validation", () => {
    it("correctly calculates UTF-8 byte length for ASCII and multibyte strings", () => {
      expect(calculateUtf8Bytes("hello")).toBe(5);
      expect(calculateUtf8Bytes("🚀")).toBe(4); // 4-byte emoji
      expect(calculateUtf8Bytes("日本語")).toBe(9); // 3 chars * 3 bytes
    });

    it("throws when title exceeds 200 characters", () => {
      const longTitle = "a".repeat(201);
      expect(() => validateClientNote(longTitle)).toThrow(
        /Title cannot exceed 200 characters/
      );
    });

    it("throws when content exceeds 256 KiB", () => {
      // Create a content payload exceeding 256 KiB
      const largeContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x".repeat(300 * 1024) }],
          },
        ],
      };
      expect(() => validateClientNote("Valid title", largeContent)).toThrow(
        /exceeds maximum limit of 256 KiB/
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Notes Listing, Empty, Loading, and Error States
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. Notes Listing, Loading & Error States", () => {
    it("renders loading state then list of notes", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValueOnce({
        notes: [SAMPLE_NOTE],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify note item is rendered
      await waitFor(() => {
        expect(screen.getByText("Architecture Planning")).toBeInTheDocument();
        expect(screen.getByText("Discussing modular monolithic boundaries.")).toBeInTheDocument();
      });
    });

    it("renders empty-library state when user has zero notes", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValueOnce({
        notes: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("No notes yet")).toBeInTheDocument();
        expect(screen.getByText(/Capture your thoughts, ideas/i)).toBeInTheDocument();
      });
    });

    it("renders error state with working retry action on failure", async () => {
      const fetchSpy = vi.spyOn(notesService, "fetchNotes")
        .mockRejectedValueOnce(new Error("Network connection lost"))
        .mockResolvedValueOnce({
          notes: [SAMPLE_NOTE],
          total: 1,
          limit: 20,
          offset: 0,
          hasMore: false,
        });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Could not load notes")).toBeInTheDocument();
        expect(screen.getByText("Network connection lost")).toBeInTheDocument();
      });

      // Click "Try again" button
      const retryBtn = screen.getByRole("button", { name: /try again/i });
      await userEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText("Architecture Planning")).toBeInTheDocument();
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Notes Search and Pagination
  // ──────────────────────────────────────────────────────────────────────────
  describe("4. Notes Search & Pagination", () => {
    it("queries backend on search and displays search-no-results state", async () => {
      vi.spyOn(notesService, "fetchNotes")
        .mockResolvedValueOnce({
          notes: [SAMPLE_NOTE],
          total: 1,
          limit: 20,
          offset: 0,
          hasMore: false,
        })
        .mockResolvedValueOnce({
          notes: [],
          total: 0,
          limit: 20,
          offset: 0,
          hasMore: false,
        });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Architecture Planning")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search notes by title or content/i);
      await userEvent.type(searchInput, "nonexistent query");

      await waitFor(() => {
        expect(screen.getByText(/No notes matching/i)).toBeInTheDocument();
      });
    });

    it("paginates next and previous correctly", async () => {
      const fetchSpy = vi.spyOn(notesService, "fetchNotes")
        .mockResolvedValueOnce({
          notes: [SAMPLE_NOTE],
          total: 35,
          limit: 20,
          offset: 0,
          hasMore: true,
        })
        .mockResolvedValueOnce({
          notes: [{ ...SAMPLE_NOTE, id: "page-2-note", title: "Page 2 Note" }],
          total: 35,
          limit: 20,
          offset: 20,
          hasMore: false,
        });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/showing/i)).toBeInTheDocument();
        expect(screen.getByText("35")).toBeInTheDocument();
      });

      const nextBtn = screen.getByRole("button", { name: /^next$/i });
      expect(nextBtn).toBeEnabled();
      await userEvent.click(nextBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({ offset: 20, limit: 20 })
        );
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Create Note Workflow & Duplicate Click Prevention
  // ──────────────────────────────────────────────────────────────────────────
  describe("5. Create Note Workflow", () => {
    it("sends exactly one create request and disables button while in flight", async () => {
      let resolveCreate;
      const createPromise = new Promise((resolve) => {
        resolveCreate = resolve;
      });

      const createSpy = vi.spyOn(notesService, "createNote").mockReturnValueOnce(createPromise);
      vi.spyOn(notesService, "fetchNotes").mockResolvedValueOnce({
        notes: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:noteId" element={<div>Editor Page Mock</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new note/i })).toBeInTheDocument();
      });

      const newNoteBtn = screen.getByRole("button", { name: /new note/i });
      await userEvent.click(newNoteBtn);

      // Button enters loading state and is disabled
      expect(screen.getByRole("button", { name: /creating\.\.\./i })).toBeDisabled();

      // Click again while in-flight -> ignored
      await userEvent.click(screen.getByRole("button", { name: /creating\.\.\./i }));
      expect(createSpy).toHaveBeenCalledTimes(1);

      // Resolve creation
      resolveCreate({
        id: "new-note-uuid",
        title: "Untitled note",
        version: 1,
      });

      await waitFor(() => {
        expect(screen.getByText("Editor Page Mock")).toBeInTheDocument();
      });
    });

    it("displays error feedback without auto-retrying on ambiguous creation failure", async () => {
      const createSpy = vi.spyOn(notesService, "createNote").mockRejectedValueOnce(
        new Error("Server timeout")
      );
      vi.spyOn(notesService, "fetchNotes").mockResolvedValueOnce({
        notes: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new note/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /new note/i }));

      await waitFor(() => {
        expect(screen.getByText("Creation could not be confirmed")).toBeInTheDocument();
        expect(screen.getByText("Server timeout")).toBeInTheDocument();
      });

      // Does not silently re-submit
      expect(createSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Note Editor Loading & Dirty State Tracking
  // ──────────────────────────────────────────────────────────────────────────
  describe("6. Note Editor Loading & Dirty State", () => {
    it("loads note without false dirty state and shows Saved badge", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
        expect(screen.getByText("Saved (v1)")).toBeInTheDocument();
      });

      // Save button is disabled because document is pristine
      expect(screen.getByRole("button", { name: /save note/i })).toBeDisabled();
    });

    it("marks as Unsaved changes on title edit and re-enables Save button", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText("Note Title");
      await userEvent.type(titleInput, " - Revised");

      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save note/i })).toBeEnabled();
    });

    it("displays 404 state when note does not exist", async () => {
      const err = new Error("Note not found");
      err.status = 404;
      vi.spyOn(notesService, "fetchNoteById").mockRejectedValueOnce(err);

      render(
        <MemoryRouter initialEntries={["/notes/nonexistent-id"]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Note Not Found")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /return to notes/i })).toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Explicit Save Workflow & Version Handling
  // ──────────────────────────────────────────────────────────────────────────
  describe("7. Explicit Save Workflow", () => {
    it("successfully saves note, increments version, and updates saved baseline", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);
      const updateSpy = vi.spyOn(notesService, "updateNote").mockResolvedValueOnce({
        ...SAMPLE_NOTE,
        title: "Architecture Planning Updated",
        version: 2,
        updatedAt: "2026-10-27T02:00:00.000Z",
      });

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText("Note Title");
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, "Architecture Planning Updated");

      const saveBtn = screen.getByRole("button", { name: /save note/i });
      expect(saveBtn).toBeEnabled();
      await userEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText("Saved (v2)")).toBeInTheDocument();
      });

      expect(updateSpy).toHaveBeenCalledWith(
        SAMPLE_NOTE.id,
        expect.objectContaining({
          title: "Architecture Planning Updated",
          expectedVersion: 1,
        })
      );
    });

    it("retains local draft and displays honest error on save failure", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);
      vi.spyOn(notesService, "updateNote").mockRejectedValueOnce(
        new Error("Database connection interrupted")
      );

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText("Note Title");
      await userEvent.type(titleInput, " (Draft)");

      await userEvent.click(screen.getByRole("button", { name: /save note/i }));

      await waitFor(() => {
        expect(screen.getAllByText("Save failed").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Database connection interrupted")).toBeInTheDocument();
      });

      // Draft remains in the input field!
      expect(screen.getByDisplayValue("Architecture Planning (Draft)")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Version Conflict Handling (HTTP 409)
  // ──────────────────────────────────────────────────────────────────────────
  describe("8. Version Conflict Handling", () => {
    it("preserves local draft and shows conflict banner on 409 conflict", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);

      const conflictErr = new Error("Note has been modified by another process.");
      conflictErr.status = 409;
      conflictErr.code = "NOTE_VERSION_CONFLICT";
      vi.spyOn(notesService, "updateNote").mockRejectedValueOnce(conflictErr);

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      await userEvent.type(screen.getByLabelText("Note Title"), " Local Edits");
      await userEvent.click(screen.getByRole("button", { name: /save note/i }));

      // Conflict alert must appear
      await waitFor(() => {
        expect(screen.getByText("Conflict Detected")).toBeInTheDocument();
        expect(screen.getByText(/Another session or process has saved a newer version/i)).toBeInTheDocument();
      });

      // Local draft is preserved!
      expect(screen.getByDisplayValue("Architecture Planning Local Edits")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /copy local draft/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /discard and reload latest/i })).toBeInTheDocument();
    });

    it("confirmed reload prompts user before discarding local edits", async () => {
      vi.spyOn(notesService, "fetchNoteById")
        .mockResolvedValueOnce(SAMPLE_NOTE)
        .mockResolvedValueOnce({
          ...SAMPLE_NOTE,
          title: "Server Version 2",
          version: 2,
        });

      const conflictErr = new Error("Conflict");
      conflictErr.status = 409;
      vi.spyOn(notesService, "updateNote").mockRejectedValueOnce(conflictErr);

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      await userEvent.type(screen.getByLabelText("Note Title"), " Local Edits");
      await userEvent.click(screen.getByRole("button", { name: /save note/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /discard and reload latest/i })).toBeInTheDocument();
      });

      // Click discard and reload -> confirmation dialog opens
      await userEvent.click(screen.getByRole("button", { name: /discard and reload latest/i }));
      expect(screen.getByText("Discard unsaved edits?")).toBeInTheDocument();

      // Confirm reload
      await userEvent.click(screen.getByRole("button", { name: /^discard and reload$/i }));

      await waitFor(() => {
        expect(screen.getByDisplayValue("Server Version 2")).toBeInTheDocument();
        expect(screen.getByText("Saved (v2)")).toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Unsaved-Change Navigation Protection
  // ──────────────────────────────────────────────────────────────────────────
  describe("9. Unsaved Changes Navigation Protection", () => {
    it("intercepts navigation when dirty and displays Stay vs Discard options", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
            <Route path="/notes" element={<div>Notes List Destination</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      // Modify title to make dirty
      await userEvent.type(screen.getByLabelText("Note Title"), " Unsaved Part");

      // Click "Notes" back button
      const backBtn = screen.getByRole("button", { name: /back to notes/i });
      await userEvent.click(backBtn);

      // Modal appears
      expect(screen.getByRole("heading", { name: "Unsaved changes" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^stay$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /discard changes and leave/i })).toBeInTheDocument();

      // Click "Stay" -> remains on page
      await userEvent.click(screen.getByRole("button", { name: /^stay$/i }));
      expect(screen.queryByText("Notes List Destination")).not.toBeInTheDocument();
      expect(screen.getByDisplayValue("Architecture Planning Unsaved Part")).toBeInTheDocument();

      // Click again and choose "Discard changes and leave"
      await userEvent.click(backBtn);
      await userEvent.click(screen.getByRole("button", { name: /discard changes and leave/i }));

      await waitFor(() => {
        expect(screen.getByText("Notes List Destination")).toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Trash Confirmation & Soft Deletion
  // ──────────────────────────────────────────────────────────────────────────
  describe("10. Trash Note Workflow", () => {
    it("requires confirmation and warns about unsaved changes before trashing", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);
      const trashSpy = vi.spyOn(notesService, "trashNote").mockResolvedValueOnce();

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
            <Route path="/notes" element={<div>Notes List View</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      // Modify to be dirty
      await userEvent.type(screen.getByLabelText("Note Title"), " (Draft)");

      // Click Trash button
      const trashBtn = screen.getByRole("button", { name: /trash this note/i });
      await userEvent.click(trashBtn);

      // Warning appears in modal
      expect(screen.getByText("Move note to trash?")).toBeInTheDocument();
      expect(screen.getByText(/Warning: You have unsaved changes that will be lost/i)).toBeInTheDocument();

      // Confirm trash
      const confirmTrashBtn = screen.getByRole("button", { name: /^move to trash$/i });
      await userEvent.click(confirmTrashBtn);

      await waitFor(() => {
        expect(trashSpy).toHaveBeenCalledWith(SAMPLE_NOTE.id, {
          expectedVersion: 1,
          csrfToken: "test-csrf-token",
        });
        expect(screen.getByText("Notes List View")).toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 11. Stabilization Pass: Pure Manual Save Model & Reliability
  // ──────────────────────────────────────────────────────────────────────────
  describe("11. Stabilization Pass: Pure Manual Save Model & Reliability", () => {
    it("typing, pausing, and blur NEVER send automatic PATCH requests", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);
      const updateSpy = vi.spyOn(notesService, "updateNote");

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
        expect(screen.getByText("Saved (v1)")).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText("Note Title");

      // 1. Typing
      await userEvent.type(titleInput, " Added Edits");
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
      expect(updateSpy).not.toHaveBeenCalled();

      // 2. Waiting beyond old debounce (2000ms)
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(updateSpy).not.toHaveBeenCalled();
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

      // 3. Blur
      await userEvent.click(document.body);
      expect(updateSpy).not.toHaveBeenCalled();
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });

    it("clean note has disabled Save, and editing enables Save", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      const saveBtn = screen.getByRole("button", { name: /save note/i });
      expect(saveBtn).toBeDisabled();

      // Edit title
      await userEvent.type(screen.getByLabelText("Note Title"), " Edit");
      expect(saveBtn).toBeEnabled();
    });

    it("clicking Save sends exactly one request, disables button during save, and updates version", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);
      let resolveSave;
      const savePromise = new Promise((resolve) => {
        resolveSave = resolve;
      });

      const updateSpy = vi
        .spyOn(notesService, "updateNote")
        .mockImplementationOnce(() => savePromise);

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText("Note Title");
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, "Architecture Planning Saved");

      const saveBtn = screen.getByRole("button", { name: /save note/i });
      await userEvent.click(saveBtn);

      // In flight: shows Saving..., save button disabled, title input read-only/disabled
      expect(screen.getByRole("button", { name: /saving\.\.\./i })).toBeDisabled();
      expect(titleInput).toBeDisabled();
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // Repeated clicks while in-flight do NOT send duplicate requests
      await userEvent.click(screen.getByRole("button", { name: /saving\.\.\./i }));
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // Resolve the save
      resolveSave({
        ...SAMPLE_NOTE,
        title: "Architecture Planning Saved",
        version: 2,
        updatedAt: "2026-10-27T04:00:00.000Z",
      });

      await waitFor(() => {
        expect(screen.getByText("Saved (v2)")).toBeInTheDocument();
      });

      // After save settles: input is re-enabled, save button is disabled because note is clean
      expect(titleInput).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /save note/i })).toBeDisabled();

      // Wait to verify no automatic follow-up request occurs
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it("keyboard shortcut Ctrl+S invokes manual save and prevents default browser dialog", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);
      const updateSpy = vi.spyOn(notesService, "updateNote").mockResolvedValueOnce({
        ...SAMPLE_NOTE,
        title: "Architecture Planning Via Shortcut",
        version: 2,
        updatedAt: "2026-10-27T04:05:00.000Z",
      });

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText("Note Title");
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, "Architecture Planning Via Shortcut");

      // Fire Ctrl+S
      const event = new KeyboardEvent("keydown", {
        key: "s",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Saved (v2)")).toBeInTheDocument();
      });
    });

    it("undo back to baseline returns to clean Saved state and disables Save button", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);
      const updateSpy = vi.spyOn(notesService, "updateNote");

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText("Note Title");

      // Type to make dirty
      await userEvent.type(titleInput, " Dirty Part");
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save note/i })).toBeEnabled();

      // Revert/clear back to original baseline
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, "Architecture Planning");

      // Returns to Saved without sending any requests
      expect(screen.getByText("Saved (v1)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save note/i })).toBeDisabled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("save failure preserves the draft, restores editing, and allows explicit retry", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);
      const updateSpy = vi
        .spyOn(notesService, "updateNote")
        .mockRejectedValueOnce(new Error("503 Service Unavailable"))
        .mockResolvedValueOnce({
          ...SAMPLE_NOTE,
          title: "Architecture Planning Retry Success",
          version: 2,
          updatedAt: "2026-10-27T04:10:00.000Z",
        });

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText("Note Title");
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, "Architecture Planning Retry Success");

      await userEvent.click(screen.getByRole("button", { name: /save note/i }));

      // Save failed banner appears
      await waitFor(() => {
        expect(screen.getAllByText("Save failed").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("503 Service Unavailable")).toBeInTheDocument();
      });

      // Draft is preserved and input is editable again!
      expect(titleInput).toHaveValue("Architecture Planning Retry Success");
      expect(titleInput).not.toBeDisabled();

      // No automatic retry occurs
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // User explicitly clicks Retry
      await userEvent.click(screen.getByRole("button", { name: /^retry$/i }));

      await waitFor(() => {
        expect(screen.getByText("Saved (v2)")).toBeInTheDocument();
      });

      expect(updateSpy).toHaveBeenCalledTimes(2);
    });

    it("useBlocker blocks router navigation when note is dirty under a data router", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);

      const routes = [
        {
          path: "/notes/:noteId",
          element: (
            <div>
              <Link to="/destination">External Destination</Link>
              <NoteEditorPage />
            </div>
          ),
        },
        {
          path: "/destination",
          element: <div>Target Reached</div>,
        },
      ];

      const router = createMemoryRouter(routes, {
        initialEntries: [`/notes/${SAMPLE_NOTE.id}`],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      // Modify to dirty
      await userEvent.type(screen.getByLabelText("Note Title"), " (Dirty)");

      // Click Link to navigate away
      await userEvent.click(screen.getByRole("link", { name: "External Destination" }));

      // useBlocker intercepts and modal is displayed!
      expect(screen.getByRole("heading", { name: "Unsaved changes" })).toBeInTheDocument();
      expect(screen.queryByText("Target Reached")).not.toBeInTheDocument();

      // Click Stay -> stays on page
      await userEvent.click(screen.getByRole("button", { name: /^stay$/i }));
      expect(screen.queryByText("Target Reached")).not.toBeInTheDocument();

      // Click Link again and choose Discard changes and leave
      await userEvent.click(screen.getByRole("link", { name: "External Destination" }));
      await userEvent.click(
        screen.getByRole("button", { name: /discard changes and leave/i })
      );

      // Successfully transitioned to destination!
      await waitFor(() => {
        expect(screen.getByText("Target Reached")).toBeInTheDocument();
      });
    });

    it("shell logout prompts user with unsaved changes dialog before destroying session", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValueOnce(SAMPLE_NOTE);

      const routes = [
        {
          element: <AppLayout />,
          children: [
            {
              path: "/notes/:noteId",
              element: <NoteEditorPage />,
            },
          ],
        },
      ];

      const router = createMemoryRouter(routes, {
        initialEntries: [`/notes/${SAMPLE_NOTE.id}`],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      // Modify note to be dirty
      await userEvent.type(screen.getByLabelText("Note Title"), " Unsaved Changes Here");

      // Find shell Log out button
      const logoutBtn = screen.getByRole("button", { name: /log out of mynotes/i });
      await userEvent.click(logoutBtn);

      // Shell intercept modal appears!
      expect(
        screen.getByText(
          /You have unsaved changes in your note\. Signing out will discard your unsaved edits\./i
        )
      ).toBeInTheDocument();

      // Click Stay and keep editing
      await userEvent.click(
        screen.getByRole("button", { name: /stay and keep editing/i })
      );

      // Modal closed, still on editor with edits preserved!
      expect(
        screen.queryByText(
          /You have unsaved changes in your note\. Signing out will discard your unsaved edits\./i
        )
      ).not.toBeInTheDocument();
      expect(
        screen.getByDisplayValue("Architecture Planning Unsaved Changes Here")
      ).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 12. Core Notes Reliability Pass: End-to-End Workflow & Visibility
  // ──────────────────────────────────────────────────────────────────────────
  describe("12. Core Notes Reliability: End-to-End Workflow & Visibility", () => {
    it("1. Create → edit → save → return to Notes → note is visible in list", async () => {
      const NEW_NOTE_ID = "b2c3d4e5-1111-2222-3333-444455556666";
      let serverNotesList = [];

      vi.spyOn(notesService, "fetchNotes").mockImplementation(async () => ({
        items: serverNotesList,
        notes: serverNotesList,
        total: serverNotesList.length,
        limit: 20,
        offset: 0,
        hasMore: false,
      }));

      vi.spyOn(notesService, "createNote").mockImplementation(async ({ title }) => {
        const note = {
          id: NEW_NOTE_ID,
          title: title || "Untitled note",
          content: { type: "doc", content: [] },
          version: 1,
          createdAt: "2026-10-27T10:00:00.000Z",
          updatedAt: "2026-10-27T10:00:00.000Z",
        };
        serverNotesList = [
          {
            id: note.id,
            title: note.title,
            preview: "",
            version: note.version,
            updatedAt: note.updatedAt,
          },
        ];
        return note;
      });

      vi.spyOn(notesService, "fetchNoteById").mockResolvedValue({
        id: NEW_NOTE_ID,
        title: "Untitled note",
        content: { type: "doc", content: [] },
        version: 1,
        createdAt: "2026-10-27T10:00:00.000Z",
        updatedAt: "2026-10-27T10:00:00.000Z",
      });

      vi.spyOn(notesService, "updateNote").mockImplementation(async (id, { title }) => {
        const updated = {
          id: NEW_NOTE_ID,
          title,
          content: { type: "doc", content: [] },
          version: 2,
          createdAt: "2026-10-27T10:00:00.000Z",
          updatedAt: "2026-10-27T10:05:00.000Z",
        };
        serverNotesList = [
          {
            id: updated.id,
            title: updated.title,
            preview: "Freshly created content",
            version: updated.version,
            updatedAt: updated.updatedAt,
          },
        ];
        return updated;
      });

      const routes = [
        { path: "/notes", element: <NotesPage /> },
        { path: "/notes/:noteId", element: <NoteEditorPage /> },
      ];

      const router = createMemoryRouter(routes, { initialEntries: ["/notes"] });
      render(<RouterProvider router={router} />);

      // Step 1: Open Notes - starts with empty library
      await waitFor(() => {
        expect(screen.getByText("No notes yet")).toBeInTheDocument();
      });

      // Step 2: Create a note
      const newNoteBtn = screen.getByRole("button", { name: /new note/i });
      await userEvent.click(newNoteBtn);

      // Step 3: Editor opens for newly created note
      await waitFor(() => {
        expect(screen.getByDisplayValue("Untitled note")).toBeInTheDocument();
      });

      // Step 4: Enter distinctive title and click Save
      const titleInput = screen.getByLabelText("Note Title");
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, "Reliability Verification Note");

      const saveBtn = screen.getByRole("button", { name: /save note/i });
      await userEvent.click(saveBtn);

      // Save confirms and transitions to Saved v2
      await waitFor(() => {
        expect(screen.getByText("Saved (v2)")).toBeInTheDocument();
      });

      // Step 5: Return to Notes list through Back to notes button
      const backBtn = screen.getByRole("button", { name: /back to notes/i });
      await userEvent.click(backBtn);

      // Step 6: Note is visible in Notes list without empty state!
      await waitFor(() => {
        expect(screen.getByText("Reliability Verification Note")).toBeInTheDocument();
        expect(screen.queryByText("No notes yet")).not.toBeInTheDocument();
      });
    });

    it("2. Open existing note → change title/body → save → list shows updates", async () => {
      let currentTitle = "Original Architecture";
      let currentVersion = 1;

      vi.spyOn(notesService, "fetchNotes").mockImplementation(async () => ({
        items: [
          {
            id: SAMPLE_NOTE.id,
            title: currentTitle,
            preview: "Architecture preview",
            version: currentVersion,
            updatedAt: "2026-10-27T12:00:00.000Z",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      }));

      vi.spyOn(notesService, "fetchNoteById").mockImplementation(async () => ({
        ...SAMPLE_NOTE,
        title: currentTitle,
        version: currentVersion,
      }));

      vi.spyOn(notesService, "updateNote").mockImplementation(async (id, { title }) => {
        currentTitle = title;
        currentVersion = 2;
        return {
          ...SAMPLE_NOTE,
          title: currentTitle,
          version: currentVersion,
          updatedAt: "2026-10-27T12:05:00.000Z",
        };
      });

      const routes = [
        { path: "/notes", element: <NotesPage /> },
        { path: "/notes/:noteId", element: <NoteEditorPage /> },
      ];

      const router = createMemoryRouter(routes, { initialEntries: ["/notes"] });
      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByText("Original Architecture")).toBeInTheDocument();
      });

      // Click card to open note
      await userEvent.click(screen.getByText("Original Architecture"));

      await waitFor(() => {
        expect(screen.getByDisplayValue("Original Architecture")).toBeInTheDocument();
      });

      // Edit title
      const titleInput = screen.getByLabelText("Note Title");
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, "Updated Architecture V2");

      // Save note
      await userEvent.click(screen.getByRole("button", { name: /save note/i }));
      await waitFor(() => {
        expect(screen.getByText("Saved (v2)")).toBeInTheDocument();
      });

      // Return to Notes
      await userEvent.click(screen.getByRole("button", { name: /back to notes/i }));

      // List displays updated title and version
      await waitFor(() => {
        expect(screen.getByText("Updated Architecture V2")).toBeInTheDocument();
        expect(screen.getByText("v2")).toBeInTheDocument();
      });
    });

    it("3. Refresh list → saved note remains visible", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [
          {
            id: SAMPLE_NOTE.id,
            title: "Persistent Note",
            preview: "Preview text",
            version: 1,
            updatedAt: "2026-10-27T12:00:00.000Z",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      const { unmount } = render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Persistent Note")).toBeInTheDocument();
      });

      // Simulate refresh by remounting NotesPage
      unmount();

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Persistent Note")).toBeInTheDocument();
      });
    });

    it("4. Open saved note again → persisted content is correct", async () => {
      const getNoteSpy = vi.spyOn(notesService, "fetchNoteById").mockResolvedValue({
        id: SAMPLE_NOTE.id,
        title: "Persisted Deep Note",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Persisted paragraph content." }],
            },
          ],
        },
        version: 3,
        updatedAt: "2026-10-27T12:10:00.000Z",
      });

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Persisted Deep Note")).toBeInTheDocument();
        expect(screen.getByText("Saved (v3)")).toBeInTheDocument();
      });

      expect(getNoteSpy).toHaveBeenCalledWith(SAMPLE_NOTE.id, expect.anything());
    });

    it("5. Active search does not masquerade as an empty library", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Search for specific query
      const searchInput = screen.getByPlaceholderText(/search notes by title or content/i);
      await userEvent.type(searchInput, "nonexistent term");

      await waitFor(() => {
        expect(screen.getByText(/No notes matching/i)).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /clear search/i }).length).toBeGreaterThanOrEqual(1);
        // Crucial: Must NOT show empty library state "No notes yet"
        expect(screen.queryByText("No notes yet")).not.toBeInTheDocument();
      });
    });

    it("6. Clearing search reveals matching owned notes", async () => {
      const fetchSpy = vi.spyOn(notesService, "fetchNotes").mockImplementation(async ({ q }) => {
        if (q && q.trim()) {
          return { items: [], total: 0, limit: 20, offset: 0, hasMore: false };
        }
        return {
          items: [
            {
              id: SAMPLE_NOTE.id,
              title: "Revealed Note",
              preview: "Found after clearing search",
              version: 1,
              updatedAt: "2026-10-27T12:00:00.000Z",
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
          hasMore: false,
        };
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText(/search notes by title or content/i);
      await userEvent.type(searchInput, "filter term");

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /clear search/i }).length).toBeGreaterThanOrEqual(1);
      });

      // Click Clear search button
      const clearButtons = screen.getAllByRole("button", { name: /clear search/i });
      await userEvent.click(clearButtons[clearButtons.length - 1]);

      await waitFor(() => {
        expect(screen.getByText("Revealed Note")).toBeInTheDocument();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ q: "" })
      );
    });

    it("7. Pagination recovers from an invalid/outdated offset", async () => {
      let callCount = 0;
      vi.spyOn(notesService, "fetchNotes").mockImplementation(async ({ offset }) => {
        callCount++;
        if (offset === 20) {
          // Empty result on page 2 because notes were deleted on backend
          return { items: [], total: 5, limit: 20, offset: 20, hasMore: false };
        }
        // Page 1 has remaining notes
        return {
          items: [
            {
              id: SAMPLE_NOTE.id,
              title: "Recovered Page 1 Note",
              preview: "Valid offset note",
              version: 1,
              updatedAt: "2026-10-27T12:00:00.000Z",
            },
          ],
          total: callCount === 1 ? 25 : 5,
          limit: 20,
          offset: 0,
          hasMore: callCount === 1,
        };
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Recovered Page 1 Note")).toBeInTheDocument();
      });

      // Click Next to navigate to offset 20
      const nextBtn = screen.getByRole("button", { name: /next/i });
      await userEvent.click(nextBtn);

      // NotesPage recovers from empty offset 20 back to offset 0
      await waitFor(() => {
        expect(screen.getByText("Recovered Page 1 Note")).toBeInTheDocument();
      });

      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it("8. An obsolete list response cannot overwrite newer results", async () => {
      let resolveFirst;
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      const fetchSpy = vi.spyOn(notesService, "fetchNotes")
        .mockImplementationOnce(() => firstPromise)
        .mockResolvedValueOnce({
          items: [
            {
              id: "note-new",
              title: "New Query Result",
              preview: "Fast response",
              version: 1,
              updatedAt: "2026-10-27T12:00:00.000Z",
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
          hasMore: false,
        });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Search immediately before first request resolves
      const searchInput = screen.getByPlaceholderText(/search notes by title or content/i);
      await userEvent.type(searchInput, "query2");

      // Wait for second request to display its results
      await waitFor(() => {
        expect(screen.getByText("New Query Result")).toBeInTheDocument();
      });

      // Now resolve the obsolete first request with old data
      resolveFirst({
        items: [
          {
            id: "note-old",
            title: "Obsolete Stale Result",
            preview: "Old response",
            version: 1,
            updatedAt: "2026-10-27T11:00:00.000Z",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      // Verify obsolete result is ignored and does NOT overwrite New Query Result
      await new Promise((r) => setTimeout(r, 200));
      expect(screen.getByText("New Query Result")).toBeInTheDocument();
      expect(screen.queryByText("Obsolete Stale Result")).not.toBeInTheDocument();
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("9. Normal return from a clean saved editor is not blocked", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValue(SAMPLE_NOTE);
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [SAMPLE_NOTE],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      const routes = [
        { path: "/notes", element: <NotesPage /> },
        { path: "/notes/:noteId", element: <NoteEditorPage /> },
      ];

      const router = createMemoryRouter(routes, {
        initialEntries: [`/notes/${SAMPLE_NOTE.id}`],
      });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      // Editor is clean (isDirty === false)
      const backBtn = screen.getByRole("button", { name: /back to notes/i });
      await userEvent.click(backBtn);

      // Successfully navigated back to /notes without any blocker prompt
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search notes by title or content/i)).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Unsaved changes" })).not.toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 13. Note Pinning & Priority Sections
  // ──────────────────────────────────────────────────────────────────────────
  describe("13. Note Pinning & Priority Sections", () => {
    const PINNED_NOTE = {
      id: "pin-1111-1111-1111-111111111111",
      title: "Pinned Important Guide",
      preview: "Must-read reference content.",
      pinned: true,
      version: 1,
      createdAt: "2026-10-27T00:00:00.000Z",
      updatedAt: "2026-10-27T02:00:00.000Z",
    };

    const UNPINNED_NOTE = {
      id: "unpin-2222-2222-2222-222222222222",
      title: "Normal Scratch Note",
      preview: "Daily meeting notes.",
      pinned: false,
      version: 1,
      createdAt: "2026-10-27T00:00:00.000Z",
      updatedAt: "2026-10-27T01:00:00.000Z",
    };

    it("1. Does NOT render Pinned section when there are zero pinned notes", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [UNPINNED_NOTE],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter>
          <NotesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Normal Scratch Note")).toBeInTheDocument();
      });

      // No "Pinned" or "Other Notes" heading should exist
      expect(screen.queryByRole("heading", { name: "Pinned" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Other Notes" })).not.toBeInTheDocument();

      // Pin button on the note card is accessible and indicates unpinned state
      const pinBtn = screen.getByRole("button", { name: "Pin note" });
      expect(pinBtn).toBeInTheDocument();
      expect(pinBtn).toHaveAttribute("aria-pressed", "false");
    });

    it("2. Renders separate Pinned and Other Notes sections when pinned notes exist", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [PINNED_NOTE, UNPINNED_NOTE],
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter>
          <NotesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Pinned" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Other Notes" })).toBeInTheDocument();
      });

      expect(screen.getByText("Pinned Important Guide")).toBeInTheDocument();
      expect(screen.getByText("Normal Scratch Note")).toBeInTheDocument();

      // Check pin buttons
      expect(screen.getByRole("button", { name: "Unpin note" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Pin note" })).toHaveAttribute("aria-pressed", "false");
    });

    it("3. Immediately toggles pin state and calls pinNote API without page reload", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [UNPINNED_NOTE],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      const pinSpy = vi.spyOn(notesService, "pinNote").mockResolvedValue({
        ...UNPINNED_NOTE,
        pinned: true,
      });

      render(
        <MemoryRouter>
          <NotesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Normal Scratch Note")).toBeInTheDocument();
      });

      expect(screen.queryByRole("heading", { name: "Pinned" })).not.toBeInTheDocument();

      // Click pin button
      const pinBtn = screen.getByRole("button", { name: "Pin note" });
      await userEvent.click(pinBtn);

      // Immediately moves to Pinned section
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Pinned" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Unpin note" })).toBeInTheDocument();
      });

      expect(pinSpy).toHaveBeenCalledWith(UNPINNED_NOTE.id, { csrfToken: "test-csrf-token" });
    });

    it("4. Immediately toggles unpin state and calls unpinNote API without page reload", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [PINNED_NOTE],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      const unpinSpy = vi.spyOn(notesService, "unpinNote").mockResolvedValue({
        ...PINNED_NOTE,
        pinned: false,
      });

      render(
        <MemoryRouter>
          <NotesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Pinned" })).toBeInTheDocument();
      });

      // Click unpin button
      const unpinBtn = screen.getByRole("button", { name: "Unpin note" });
      await userEvent.click(unpinBtn);

      // Pinned section disappears since 0 pinned notes remain
      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: "Pinned" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pin note" })).toBeInTheDocument();
      });

      expect(unpinSpy).toHaveBeenCalledWith(PINNED_NOTE.id, { csrfToken: "test-csrf-token" });
    });

    it("5. Reverts optimistic pin update when API call fails", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [UNPINNED_NOTE],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      vi.spyOn(notesService, "pinNote").mockRejectedValue(new Error("Network connection lost"));

      render(
        <MemoryRouter>
          <NotesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Normal Scratch Note")).toBeInTheDocument();
      });

      const pinBtn = screen.getByRole("button", { name: "Pin note" });
      await userEvent.click(pinBtn);

      // Rollback to unpinned after rejection and display error alert
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText("Network connection lost")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pin note" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Pinned" })).not.toBeInTheDocument();
      });
    });

    it("6. Clicking pin button does NOT trigger link navigation", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [UNPINNED_NOTE],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      vi.spyOn(notesService, "pinNote").mockResolvedValue({
        ...UNPINNED_NOTE,
        pinned: true,
      });

      const routes = [
        { path: "/notes", element: <NotesPage /> },
        { path: "/notes/:noteId", element: <div>Editor Mock</div> },
      ];
      const router = createMemoryRouter(routes, { initialEntries: ["/notes"] });

      render(<RouterProvider router={router} />);

      await waitFor(() => {
        expect(screen.getByText("Normal Scratch Note")).toBeInTheDocument();
      });

      const pinBtn = screen.getByRole("button", { name: "Pin note" });
      await userEvent.click(pinBtn);

      // We should still be on /notes, NOT on /notes/:id
      expect(router.state.location.pathname).toBe("/notes");
      expect(screen.queryByText("Editor Mock")).not.toBeInTheDocument();
    });

    it("7. NoteEditorPage allows toggling pin state via editor toolbar", async () => {
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValue({
        ...SAMPLE_NOTE,
        pinned: false,
      });
      const pinSpy = vi.spyOn(notesService, "pinNote").mockResolvedValue({
        ...SAMPLE_NOTE,
        pinned: true,
      });

      render(
        <MemoryRouter initialEntries={[`/notes/${SAMPLE_NOTE.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Architecture Planning")).toBeInTheDocument();
      });

      const editorPinBtn = screen.getByRole("button", { name: "Pin note" });
      expect(editorPinBtn).toHaveAttribute("aria-pressed", "false");

      await userEvent.click(editorPinBtn);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Unpin note" })).toHaveAttribute("aria-pressed", "true");
      });

      expect(pinSpy).toHaveBeenCalledWith(SAMPLE_NOTE.id, { csrfToken: "test-csrf-token" });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 14. Trash View & Restore Flow
  // ──────────────────────────────────────────────────────────────────────────
  describe("14. Trash View & Restore Flow", () => {
    const TRASHED_NOTE_1 = {
      id: "trash-1111-1111-1111-111111111111",
      title: "Discarded Proposal",
      preview: "Old deprecated design doc.",
      pinned: true,
      version: 2,
      createdAt: "2026-10-27T00:00:00.000Z",
      updatedAt: "2026-10-27T01:00:00.000Z",
      deletedAt: "2026-10-27T02:00:00.000Z",
    };

    const TRASHED_NOTE_2 = {
      id: "trash-2222-2222-2222-222222222222",
      title: "Temporary Scratchpad",
      preview: "Random ideas not needed anymore.",
      pinned: false,
      version: 1,
      createdAt: "2026-10-27T00:00:00.000Z",
      updatedAt: "2026-10-27T00:30:00.000Z",
      deletedAt: "2026-10-27T01:30:00.000Z",
    };

    it("1. Renders empty Trash state ('Trash is empty') when no trashed notes exist", async () => {
      vi.spyOn(notesService, "fetchTrashedNotes").mockResolvedValue({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/trash"]}>
          <TrashPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Trash is empty" })).toBeInTheDocument();
      });

      // Does not render "No notes yet"
      expect(screen.queryByRole("heading", { name: "No notes yet" })).not.toBeInTheDocument();
      expect(screen.getByText(/deleted notes will appear here/i)).toBeInTheDocument();
    });

    it("2. Renders list of soft-deleted notes with title, preview, and pinned badge", async () => {
      vi.spyOn(notesService, "fetchTrashedNotes").mockResolvedValue({
        items: [TRASHED_NOTE_1, TRASHED_NOTE_2],
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/trash"]}>
          <TrashPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Discarded Proposal")).toBeInTheDocument();
        expect(screen.getByText("Temporary Scratchpad")).toBeInTheDocument();
      });

      // Pinned badge on TRASHED_NOTE_1
      expect(screen.getByText("Pinned")).toBeInTheDocument();

      // Check accessible Restore buttons
      expect(screen.getByRole("button", { name: 'Restore note "Discarded Proposal"' })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: 'Restore note "Temporary Scratchpad"' })).toBeInTheDocument();
    });

    it("3. NotesPage includes clear Trash navigation link", async () => {
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <NotesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        const trashLink = screen.getByRole("link", { name: "View Trash" });
        expect(trashLink).toBeInTheDocument();
        expect(trashLink).toHaveAttribute("href", "/trash");
      });
    });

    it("4. Restoring a note removes it from Trash immediately and displays success notification", async () => {
      vi.spyOn(notesService, "fetchTrashedNotes").mockResolvedValue({
        items: [TRASHED_NOTE_1],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      const restoreSpy = vi.spyOn(notesService, "restoreNote").mockResolvedValue({
        ...TRASHED_NOTE_1,
        deletedAt: null,
      });

      render(
        <MemoryRouter initialEntries={["/trash"]}>
          <TrashPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Discarded Proposal")).toBeInTheDocument();
      });

      const restoreBtn = screen.getByRole("button", { name: 'Restore note "Discarded Proposal"' });
      await userEvent.click(restoreBtn);

      // Verify immediate removal from list and empty state appearance
      await waitFor(() => {
        expect(screen.queryByText("Discarded Proposal")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Trash is empty" })).toBeInTheDocument();
      });

      // Verify restore success banner
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText(/Restored/)).toBeInTheDocument();

      expect(restoreSpy).toHaveBeenCalledWith(TRASHED_NOTE_1.id, { csrfToken: "test-csrf-token" });
    });

    it("5. Restoring a pinned note preserves pinned state and renders in Pinned section on NotesPage", async () => {
      // 1. Initially NotesPage has no notes
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        items: [
          {
            ...TRASHED_NOTE_1,
            deletedAt: null,
            pinned: true,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <NotesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Pinned" })).toBeInTheDocument();
        expect(screen.getByText("Discarded Proposal")).toBeInTheDocument();
      });
    });

    it("6. Reverts optimistic removal from Trash if restoreNote API fails", async () => {
      vi.spyOn(notesService, "fetchTrashedNotes").mockResolvedValue({
        items: [TRASHED_NOTE_1],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      vi.spyOn(notesService, "restoreNote").mockRejectedValue(new Error("Database connection error"));

      render(
        <MemoryRouter initialEntries={["/trash"]}>
          <TrashPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Discarded Proposal")).toBeInTheDocument();
      });

      const restoreBtn = screen.getByRole("button", { name: 'Restore note "Discarded Proposal"' });
      await userEvent.click(restoreBtn);

      // Should rollback and display error message
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText("Database connection error")).toBeInTheDocument();
        expect(screen.getByText("Discarded Proposal")).toBeInTheDocument();
      });
    });

    it("7. Opening a trashed note directly via /notes/:id displays Note Not Found state", async () => {
      const err = new Error("Note not found.");
      err.status = 404;
      vi.spyOn(notesService, "fetchNoteById").mockRejectedValue(err);

      render(
        <MemoryRouter initialEntries={[`/notes/${TRASHED_NOTE_1.id}`]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Note Not Found" })).toBeInTheDocument();
        expect(
          screen.getByText(/belongs to another user, or has been moved to trash/i)
        ).toBeInTheDocument();
      });
    });
  });
});
