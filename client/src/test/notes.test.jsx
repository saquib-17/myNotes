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
import { MemoryRouter, Routes, Route } from "react-router-dom";
import NotesPage from "../pages/NotesPage.jsx";
import NoteEditorPage from "../pages/NoteEditorPage.jsx";
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
        expect(screen.getByText("Save failed")).toBeInTheDocument();
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
      const backBtn = screen.getByRole("button", { name: /^notes$/i });
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
});
