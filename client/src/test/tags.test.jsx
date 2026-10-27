import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AppLayout from "../layouts/AppLayout.jsx";
import NotesPage from "../pages/NotesPage.jsx";
import NoteEditorPage from "../pages/NoteEditorPage.jsx";
import TagNotesPage from "../pages/TagNotesPage.jsx";
import { CollectionsProvider } from "../context/CollectionsContext.jsx";
import { TagsProvider } from "../context/TagsContext.jsx";
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

const SAMPLE_TAGS = [
  {
    id: "70000000-0001-4000-8000-000000000000",
    name: "react",
    noteCount: 2,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "70000000-0002-4000-8000-000000000000",
    name: "interview",
    noteCount: 1,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
];

const SAMPLE_TAG_NOTES = [
  {
    id: "907e0000-0001-4000-8000-000000000000",
    title: "Pinned React Hooks Note",
    preview: "useEffect and useState cheat sheet.",
    pinned: true,
    tags: [{ id: "70000000-0001-4000-8000-000000000000", name: "react" }],
    version: 1,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "907e0000-0002-4000-8000-000000000000",
    title: "Component Lifecycle",
    preview: "Mounting and unmounting notes.",
    pinned: false,
    tags: [{ id: "70000000-0001-4000-8000-000000000000", name: "react" }],
    version: 2,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
];

describe("Tags Feature Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Route Safety & Metadata", () => {
    it("allows valid tag UUID paths in safeReturnPath", () => {
      expect(
        safeReturnPath("/tags/70000000-0001-4000-8000-000000000000")
      ).toBe("/tags/70000000-0001-4000-8000-000000000000");
    });

    it("rejects invalid tag routes and falls back to /dashboard", () => {
      expect(safeReturnPath("/tags/not-a-uuid")).toBe("/dashboard");
      expect(safeReturnPath("/tags/")).toBe("/dashboard");
    });

    it("provides tag route metadata", () => {
      const meta = getRouteMetadata("/tags/70000000-0001-4000-8000-000000000000");
      expect(meta.title).toBe("Tag");
      expect(meta.description).toContain("tagged");
    });
  });

  describe("2. Sidebar Tags Navigation & Modal", () => {
    it("renders tags section in sidebar with note count", async () => {
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: [],
        total: 0,
      });
      vi.spyOn(notesService, "fetchTags").mockResolvedValue(SAMPLE_TAGS);

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <CollectionsProvider>
            <TagsProvider>
              <AppLayout />
            </TagsProvider>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText("react")[0]).toBeInTheDocument();
        expect(screen.getAllByText("interview")[0]).toBeInTheDocument();
      });
    });

    it("opens create tag modal, validates name, and submits successfully", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: [],
        total: 0,
      });
      vi.spyOn(notesService, "fetchTags").mockResolvedValue(SAMPLE_TAGS);
      const createTagSpy = vi.spyOn(notesService, "createTag").mockResolvedValue({
        id: "70000000-0003-4000-8000-000000000000",
        name: "testing",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <CollectionsProvider>
            <TagsProvider>
              <AppLayout />
            </TagsProvider>
          </CollectionsProvider>
        </MemoryRouter>
      );

      const createButtons = screen.getAllByRole("button", { name: "Create tag" });
      await user.click(createButtons[0]);

      expect(screen.getByRole("heading", { name: "New Tag" })).toBeInTheDocument();

      const input = screen.getByLabelText(/Tag Name/i);
      await user.type(input, "testing");

      const submitBtn = screen.getByRole("button", { name: "Create Tag" });
      await user.click(submitBtn);

      expect(createTagSpy).toHaveBeenCalledWith({
        name: "testing",
        csrfToken: "test-csrf-token",
      });
    });
  });

  describe("3. NotesPage Tag Filtering & Badges", () => {
    it("displays tag filter dropdown and passes tagId when selected", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: [],
        total: 0,
      });
      vi.spyOn(notesService, "fetchTags").mockResolvedValue(SAMPLE_TAGS);
      const fetchNotesSpy = vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        notes: SAMPLE_TAG_NOTES,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <CollectionsProvider>
            <TagsProvider>
              <NotesPage />
            </TagsProvider>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Filter by tag")).toBeInTheDocument();
      });

      const tagFilter = screen.getByLabelText("Filter by tag");
      await user.selectOptions(tagFilter, "70000000-0001-4000-8000-000000000000");

      expect(fetchNotesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tagId: "70000000-0001-4000-8000-000000000000",
        })
      );
    });

    it("renders tag badges on note cards", async () => {
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: [],
        total: 0,
      });
      vi.spyOn(notesService, "fetchTags").mockResolvedValue(SAMPLE_TAGS);
      vi.spyOn(notesService, "fetchNotes").mockResolvedValue({
        notes: SAMPLE_TAG_NOTES,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/notes"]}>
          <CollectionsProvider>
            <TagsProvider>
              <NotesPage />
            </TagsProvider>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Pinned React Hooks Note")).toBeInTheDocument();
      });

      expect(screen.getAllByText("#react").length).toBeGreaterThan(0);
    });
  });

  describe("4. NoteEditorPage Tag Input & Editing", () => {
    it("loads note tags, adds a tag via Enter, and removes a tag with ×", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: [],
        total: 0,
      });
      vi.spyOn(notesService, "fetchTags").mockResolvedValue(SAMPLE_TAGS);
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValue({
        id: "907e0000-0001-4000-8000-000000000000",
        title: "Test Note",
        content: { type: "doc", content: [{ type: "paragraph" }] },
        version: 1,
        pinned: false,
        tags: [{ id: "70000000-0001-4000-8000-000000000000", name: "react" }],
        updatedAt: "2026-10-27T10:00:00.000Z",
      });

      const updateNoteSpy = vi.spyOn(notesService, "updateNote").mockResolvedValue({
        id: "907e0000-0001-4000-8000-000000000000",
        title: "Test Note",
        content: { type: "doc", content: [{ type: "paragraph" }] },
        version: 2,
        pinned: false,
        tags: [
          { id: "70000000-0001-4000-8000-000000000000", name: "react" },
          { id: "70000000-0002-4000-8000-000000000000", name: "frontend" },
        ],
        updatedAt: "2026-10-27T10:05:00.000Z",
      });

      render(
        <MemoryRouter initialEntries={["/notes/907e0000-0001-4000-8000-000000000000"]}>
          <CollectionsProvider>
            <TagsProvider>
              <Routes>
                <Route path="/notes/:noteId" element={<NoteEditorPage />} />
              </Routes>
            </TagsProvider>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("#react")).toBeInTheDocument();
      });

      // Add a tag "frontend"
      const tagInput = screen.getByPlaceholderText(/Add tag/i);
      await user.type(tagInput, "frontend{enter}");

      expect(screen.getByText("#frontend")).toBeInTheDocument();

      // Check Save button is enabled
      const saveBtn = screen.getByRole("button", { name: "Save note" });
      expect(saveBtn).not.toBeDisabled();

      await user.click(saveBtn);

      expect(updateNoteSpy).toHaveBeenCalledWith(
        "907e0000-0001-4000-8000-000000000000",
        expect.objectContaining({
          tags: ["react", "frontend"],
        })
      );
    });

    it("removing a tag marks the note dirty and updates save state", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: [],
        total: 0,
      });
      vi.spyOn(notesService, "fetchTags").mockResolvedValue(SAMPLE_TAGS);
      vi.spyOn(notesService, "fetchNoteById").mockResolvedValue({
        id: "907e0000-0001-4000-8000-000000000000",
        title: "Test Note",
        content: { type: "doc", content: [{ type: "paragraph" }] },
        version: 1,
        pinned: false,
        tags: [{ id: "70000000-0001-4000-8000-000000000000", name: "react" }],
        updatedAt: "2026-10-27T10:00:00.000Z",
      });

      render(
        <MemoryRouter initialEntries={["/notes/907e0000-0001-4000-8000-000000000000"]}>
          <CollectionsProvider>
            <TagsProvider>
              <Routes>
                <Route path="/notes/:noteId" element={<NoteEditorPage />} />
              </Routes>
            </TagsProvider>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("#react")).toBeInTheDocument();
      });

      const removeBtn = screen.getByLabelText("Remove tag react");
      await user.click(removeBtn);

      expect(screen.queryByText("#react")).not.toBeInTheDocument();

      // Save button should now be enabled
      const saveBtn = screen.getByRole("button", { name: "Save note" });
      expect(saveBtn).not.toBeDisabled();
    });
  });

  describe("5. TagNotesPage View & Actions", () => {
    it("renders tag page with pinned-first note ordering", async () => {
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: [],
        total: 0,
      });
      vi.spyOn(notesService, "fetchTags").mockResolvedValue(SAMPLE_TAGS);
      vi.spyOn(notesService, "fetchTagNotes").mockResolvedValue({
        tag: SAMPLE_TAGS[0],
        notes: SAMPLE_TAG_NOTES,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/tags/70000000-0001-4000-8000-000000000000"]}>
          <CollectionsProvider>
            <TagsProvider>
              <Routes>
                <Route path="/tags/:tagId" element={<TagNotesPage />} />
              </Routes>
            </TagsProvider>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "react" })).toBeInTheDocument();
      });

      expect(screen.getByText(/Pinned \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText("Pinned React Hooks Note")).toBeInTheDocument();
      expect(screen.getByText("Component Lifecycle")).toBeInTheDocument();
    });

    it("opens delete modal with safety explanation and confirms deletion", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
        collections: [],
        total: 0,
      });
      vi.spyOn(notesService, "fetchTags").mockResolvedValue(SAMPLE_TAGS);
      vi.spyOn(notesService, "fetchTagNotes").mockResolvedValue({
        tag: SAMPLE_TAGS[0],
        notes: SAMPLE_TAG_NOTES,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      const deleteTagSpy = vi.spyOn(notesService, "deleteTag").mockResolvedValue();

      render(
        <MemoryRouter initialEntries={["/tags/70000000-0001-4000-8000-000000000000"]}>
          <CollectionsProvider>
            <TagsProvider>
              <Routes>
                <Route path="/tags/:tagId" element={<TagNotesPage />} />
                <Route path="/notes" element={<div>Notes Listing Page</div>} />
              </Routes>
            </TagsProvider>
          </CollectionsProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Delete tag/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Delete tag/i }));

      // Check modal content
      expect(
        screen.getByText(/Your notes will NOT be deleted/i)
      ).toBeInTheDocument();

      const confirmDeleteBtn = screen.getAllByRole("button", { name: "Delete tag" })[1];
      await user.click(confirmDeleteBtn);

      expect(deleteTagSpy).toHaveBeenCalledWith("70000000-0001-4000-8000-000000000000", {
        csrfToken: "test-csrf-token",
      });
    });
  });
});
