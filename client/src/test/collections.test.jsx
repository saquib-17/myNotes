import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AppLayout from "../layouts/AppLayout.jsx";
import NotesPage from "../pages/NotesPage.jsx";
import NoteEditorPage from "../pages/NoteEditorPage.jsx";
import CollectionNotesPage from "../pages/CollectionNotesPage.jsx";
import { CollectionsProvider } from "../context/CollectionsContext.jsx";
import { safeReturnPath, getRouteMetadata } from "../constants/routes.js";
import * as notesService from "../services/notes.service.js";

const mockGetCsrfToken = vi.fn().mockResolvedValue("test-csrf-token");
vi.mock("../context/useAuth.js", () => ({
  useAuth: () => ({
    user: { id: "user-123", email: "user@example.com" },
    isAuthenticated: true,
    getCsrfToken: mockGetCsrfToken,
    logout: vi.fn(),
  }),
}));

const SAMPLE_COLLECTIONS = [
  {
    id: "c011ec71-0001-4000-8000-000000000000",
    name: "DSA",
    noteCount: 2,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "c011ec71-0002-4000-8000-000000000000",
    name: "Placement Prep",
    noteCount: 1,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
];

const SAMPLE_COLLECTION_NOTES = [
  {
    id: "907e0000-0001-4000-8000-000000000000",
    title: "Pinned DSA Roadmap",
    preview: "Important roadmap.",
    pinned: true,
    collectionId: "c011ec71-0001-4000-8000-000000000000",
    version: 1,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "907e0000-0002-4000-8000-000000000000",
    title: "Graph Algorithms",
    preview: "BFS and DFS notes.",
    pinned: false,
    collectionId: "c011ec71-0001-4000-8000-000000000000",
    version: 2,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
];

describe("Collections Feature Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Route Safety & Metadata", () => {
    it("allows valid collection UUID paths in safeReturnPath", () => {
      expect(
        safeReturnPath("/collections/c011ec71-0001-4000-8000-000000000000")
      ).toBe("/collections/c011ec71-0001-4000-8000-000000000000");
    });

    it("rejects invalid collection routes and falls back to /dashboard", () => {
      expect(safeReturnPath("/collections/not-a-uuid")).toBe("/dashboard");
      expect(safeReturnPath("/collections/")).toBe("/dashboard");
    });

    it("provides collection route metadata", () => {
      const meta = getRouteMetadata("/collections/c011ec71-0001-4000-8000-000000000000");
      expect(meta.title).toBe("Collection");
      expect(meta.description).toContain("collection");
    });
  });

  describe("2. Sidebar Collections Navigation & Modal", () => {
    it("renders collections section in sidebar with note count", async () => {
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: SAMPLE_COLLECTIONS,
        total: 2,
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <CollectionsProvider>
            <AppLayout />
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText("Collections").length).toBeGreaterThan(0);
      });

      expect(screen.getAllByText("DSA").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Placement Prep").length).toBeGreaterThan(0);
    });

    it("opens create collection modal and creates a collection", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: SAMPLE_COLLECTIONS,
        total: 2,
      });
      const createSpy = vi.spyOn(notesService, "createCollection").mockResolvedValue({
        id: "c011ec71-0003-4000-8000-000000000000",
        name: "Web Dev",
        noteCount: 0,
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <CollectionsProvider>
            <AppLayout />
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByLabelText("Create collection").length).toBeGreaterThan(0);
      });

      const newButton = screen.getAllByLabelText("Create collection")[0];
      await user.click(newButton);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("New Collection")).toBeInTheDocument();

      const input = screen.getByLabelText(/Collection Name/i);
      await user.type(input, "Web Dev");

      const submitBtn = screen.getByRole("button", { name: "Create Collection" });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith({
          name: "Web Dev",
          csrfToken: "test-csrf-token",
        });
      });
    });

    it("displays error in modal if collection creation fails with 409 Conflict", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: SAMPLE_COLLECTIONS,
        total: 2,
      });
      vi.spyOn(notesService, "createCollection").mockRejectedValue({
        status: 409,
        message: "A collection with this name already exists.",
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <CollectionsProvider>
            <AppLayout />
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByLabelText("Create collection").length).toBeGreaterThan(0);
      });

      const newButton = screen.getAllByLabelText("Create collection")[0];
      await user.click(newButton);

      const input = screen.getByLabelText(/Collection Name/i);
      await user.type(input, "DSA");

      const submitBtn = screen.getByRole("button", { name: "Create Collection" });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText("A collection with this name already exists.")
        ).toBeInTheDocument();
      });
    });
  });

  describe("3. Collection Notes Page (/collections/:collectionId)", () => {
    it("renders collection notes with pinned-first ordering and note count", async () => {
      vi.spyOn(notesService, "fetchCollectionNotes").mockResolvedValue({
        notes: SAMPLE_COLLECTION_NOTES,
        total: 2,
        hasMore: false,
        collection: SAMPLE_COLLECTIONS[0],
      });
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: SAMPLE_COLLECTIONS,
        total: 2,
      });

      render(
        <MemoryRouter initialEntries={["/collections/c011ec71-0001-4000-8000-000000000000"]}>
          <CollectionsProvider>
            <Routes>
              <Route path="/collections/:collectionId" element={<CollectionNotesPage />} />
            </Routes>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Pinned DSA Roadmap")).toBeInTheDocument();
        expect(screen.getByText("Graph Algorithms")).toBeInTheDocument();
      });

      expect(screen.getByText("Pinned")).toBeInTheDocument();
      expect(screen.getByText("Other Notes")).toBeInTheDocument();
    });

    it("displays empty state when collection has no notes", async () => {
      vi.spyOn(notesService, "fetchCollectionNotes").mockResolvedValue({
        notes: [],
        total: 0,
        hasMore: false,
        collection: SAMPLE_COLLECTIONS[1],
      });
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: SAMPLE_COLLECTIONS,
        total: 2,
      });

      render(
        <MemoryRouter initialEntries={["/collections/c011ec71-0002-4000-8000-000000000000"]}>
          <CollectionsProvider>
            <Routes>
              <Route path="/collections/:collectionId" element={<CollectionNotesPage />} />
            </Routes>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("No notes in this collection yet")).toBeInTheDocument();
      });
    });

    it("allows renaming collection via modal", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "fetchCollectionNotes").mockResolvedValue({
        notes: SAMPLE_COLLECTION_NOTES,
        total: 2,
        hasMore: false,
        collection: SAMPLE_COLLECTIONS[0],
      });
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: SAMPLE_COLLECTIONS,
        total: 2,
      });
      const updateSpy = vi.spyOn(notesService, "updateCollection").mockResolvedValue({
        id: "c011ec71-0001-4000-8000-000000000000",
        name: "DSA Masterclass",
      });

      render(
        <MemoryRouter initialEntries={["/collections/c011ec71-0001-4000-8000-000000000000"]}>
          <CollectionsProvider>
            <Routes>
              <Route path="/collections/:collectionId" element={<CollectionNotesPage />} />
            </Routes>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Rename/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Rename/i }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Rename Collection")).toBeInTheDocument();

      const input = screen.getByLabelText(/Collection Name/i);
      await user.clear(input);
      await user.type(input, "DSA Masterclass");

      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          "c011ec71-0001-4000-8000-000000000000",
          { name: "DSA Masterclass", csrfToken: "test-csrf-token" }
        );
      });
    });

    it("confirms collection deletion and informs that notes will not be deleted", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "fetchCollectionNotes").mockResolvedValue({
        notes: SAMPLE_COLLECTION_NOTES,
        total: 2,
        hasMore: false,
        collection: SAMPLE_COLLECTIONS[0],
      });
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: SAMPLE_COLLECTIONS,
        total: 2,
      });
      const deleteSpy = vi.spyOn(notesService, "deleteCollection").mockResolvedValue();

      render(
        <MemoryRouter initialEntries={["/collections/c011ec71-0001-4000-8000-000000000000"]}>
          <CollectionsProvider>
            <Routes>
              <Route path="/collections/:collectionId" element={<CollectionNotesPage />} />
              <Route path="/notes" element={<div>Notes List Page</div>} />
            </Routes>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Delete/i }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("heading", { name: "Delete Collection" })).toBeInTheDocument();
      expect(within(dialog).getByText(/delete any notes inside this collection/i)).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Delete Collection" }));

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledWith(
          "c011ec71-0001-4000-8000-000000000000",
          { csrfToken: "test-csrf-token" }
        );
      });
    });

    it("shows Collection Not Found for 404 response", async () => {
      vi.spyOn(notesService, "fetchCollectionNotes").mockRejectedValue({
        status: 404,
        message: "Collection not found.",
      });

      render(
        <MemoryRouter initialEntries={["/collections/00000000-0000-0000-0000-000000000000"]}>
          <CollectionsProvider>
            <Routes>
              <Route path="/collections/:collectionId" element={<CollectionNotesPage />} />
            </Routes>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Collection Not Found")).toBeInTheDocument();
      });
    });
  });

  describe("4. Notes Page Collection Filter", () => {
    it("renders collection filter dropdown and filters notes on selection", async () => {
      const user = userEvent.setup();
      const fetchNotesSpy = vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        notes: SAMPLE_COLLECTION_NOTES,
        total: 2,
        hasMore: false,
      });
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: SAMPLE_COLLECTIONS,
        total: 2,
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <CollectionsProvider>
            <NotesPage />
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Filter by collection")).toBeInTheDocument();
      });

      const select = screen.getByLabelText("Filter by collection");
      expect(select).toHaveValue("");

      await user.selectOptions(select, "c011ec71-0001-4000-8000-000000000000");

      await waitFor(() => {
        expect(fetchNotesSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            collectionId: "c011ec71-0001-4000-8000-000000000000",
          })
        );
      });
    });
  });

  describe("5. Note Editor Collection Selector & Explicit Save", () => {
    it("renders collection selector and marks dirty when collection is changed", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValue({
        id: "907e0000-0001-4000-8000-000000000000",
        title: "Test Note",
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
        },
        version: 1,
        pinned: false,
        collectionId: null,
        updatedAt: "2026-10-27T10:00:00.000Z",
      });
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: SAMPLE_COLLECTIONS,
        total: 2,
      });
      const updateNoteSpy = vi.spyOn(notesService, "updateNote").mockResolvedValue({
        id: "907e0000-0001-4000-8000-000000000000",
        title: "Test Note",
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
        },
        version: 2,
        pinned: false,
        collectionId: "c011ec71-0001-4000-8000-000000000000",
        updatedAt: "2026-10-27T11:00:00.000Z",
      });

      render(
        <MemoryRouter initialEntries={["/notes/907e0000-0001-4000-8000-000000000000"]}>
          <CollectionsProvider>
            <Routes>
              <Route path="/notes/:noteId" element={<NoteEditorPage />} />
            </Routes>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Assign collection")).toBeInTheDocument();
      });

      const colSelect = screen.getByLabelText("Assign collection");
      expect(colSelect).toHaveValue("");

      // Change collection to DSA
      await user.selectOptions(colSelect, "c011ec71-0001-4000-8000-000000000000");

      // Verify dirty state
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

      // Save note
      const saveBtn = screen.getByRole("button", { name: "Save note" });
      expect(saveBtn).not.toBeDisabled();
      await user.click(saveBtn);

      await waitFor(() => {
        expect(updateNoteSpy).toHaveBeenCalledWith(
          "907e0000-0001-4000-8000-000000000000",
          expect.objectContaining({
            collectionId: "c011ec71-0001-4000-8000-000000000000",
            expectedVersion: 1,
            csrfToken: "test-csrf-token",
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText("Saved (v2)")).toBeInTheDocument();
      });
    });
  });
});
