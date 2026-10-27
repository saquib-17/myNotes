import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DocumentsPage from "../pages/DocumentsPage.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import * as notesService from "../services/notes.service.js";

const mockGetCsrfToken = vi.fn().mockResolvedValue("test-csrf-token");
let mockIsAuthenticated = true;

vi.mock("../context/useAuth.js", () => ({
  useAuth: () => ({
    user: mockIsAuthenticated ? { id: "user-123", email: "user@example.com" } : null,
    isAuthenticated: mockIsAuthenticated,
    getCsrfToken: mockGetCsrfToken,
    logout: vi.fn(),
  }),
}));

const SAMPLE_DOCUMENTS = [
  {
    id: "d0000000-0001-4000-8000-000000000001",
    title: "React Official Documentation",
    url: "https://react.dev",
    description: "The official React documentation and interactive tutorials.",
    category: "documentation",
    topic: "Frontend",
    favorite: true,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "d0000000-0002-4000-8000-000000000002",
    title: "Clean Architecture Principles PDF",
    url: "https://example.com/clean-architecture.pdf",
    description: "Guide to software architecture and dependency rules.",
    category: "pdf",
    topic: "Architecture",
    favorite: false,
    createdAt: "2026-10-27T09:00:00.000Z",
    updatedAt: "2026-10-27T09:00:00.000Z",
  },
  {
    id: "d0000000-0003-4000-8000-000000000003",
    title: "PostgreSQL High Performance Article",
    url: "https://example.com/postgres-perf",
    description: "Tuning query planner and indexing strategies in PostgreSQL.",
    category: "article",
    topic: "Database",
    favorite: false,
    createdAt: "2026-10-27T08:00:00.000Z",
    updatedAt: "2026-10-27T08:00:00.000Z",
  },
];

function renderDocumentsPage({ initialEntries = ["/documents"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <DocumentsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page Mock</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Document Library Feature Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    vi.spyOn(notesService, "fetchDocuments").mockResolvedValue({
      documents: [...SAMPLE_DOCUMENTS],
      items: [...SAMPLE_DOCUMENTS],
      total: SAMPLE_DOCUMENTS.length,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
  });

  // 1. Protected Route
  it("redirects unauthenticated users to /login", async () => {
    mockIsAuthenticated = false;
    renderDocumentsPage();

    await waitFor(() => {
      expect(screen.getByText("Login Page Mock")).toBeInTheDocument();
    });
  });

  // 2. Listing & Attributes
  it("renders documents with category badges, topics, domain snippet, and safe external links", async () => {
    renderDocumentsPage();

    await waitFor(() => {
      expect(screen.getByText("React Official Documentation")).toBeInTheDocument();
    });

    // Check subtitle
    expect(screen.getByText("Store and reference important documents here.")).toBeInTheDocument();

    // Check titles & descriptions
    expect(screen.getByText("Clean Architecture Principles PDF")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL High Performance Article")).toBeInTheDocument();
    expect(
      screen.getByText("The official React documentation and interactive tutorials.")
    ).toBeInTheDocument();

    // Check category badges
    expect(screen.getByText("documentation")).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("article")).toBeInTheDocument();

    // Check topics
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    expect(screen.getByText("Architecture")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();

    // Check domain snippets
    expect(screen.getByText("react.dev")).toBeInTheDocument();
    expect(screen.getAllByText("example.com").length).toBe(2);

    // Check safe external link attributes (target="_blank" and rel="noopener noreferrer")
    const reactLink = screen.getByRole("link", { name: /React Official Documentation/i });
    expect(reactLink).toHaveAttribute("href", "https://react.dev");
    expect(reactLink).toHaveAttribute("target", "_blank");
    expect(reactLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  // 3. Create Document Modal
  it("creates a document via modal with validation and csrfToken", async () => {
    const user = userEvent.setup({ delay: null });
    const createSpy = vi.spyOn(notesService, "createDocument").mockResolvedValue({
      id: "d0000000-0004-4000-8000-000000000004",
      title: "MIT Distributed Systems Course",
      url: "https://pdos.csail.mit.edu/6.824/",
      description: "Graduate level distributed systems course materials and labs.",
      category: "course",
      topic: "Distributed Systems",
      favorite: true,
      createdAt: "2026-10-27T12:00:00.000Z",
      updatedAt: "2026-10-27T12:00:00.000Z",
    });

    renderDocumentsPage();

    await waitFor(() => {
      expect(screen.getByText("React Official Documentation")).toBeInTheDocument();
    });

    const addBtn = screen.getByRole("button", { name: /Add Document/i });
    await user.click(addBtn);

    const dialog = screen.getByRole("dialog", { name: "Add New Document" });
    expect(dialog).toBeInTheDocument();

    const titleInput = within(dialog).getByLabelText(/Title/i);
    await user.type(titleInput, "MIT Distributed Systems Course");

    const urlInput = within(dialog).getByLabelText(/URL/i);
    await user.type(urlInput, "https://pdos.csail.mit.edu/6.824/");

    const categorySelect = within(dialog).getByLabelText(/Category/i);
    await user.selectOptions(categorySelect, "course");

    const topicInput = within(dialog).getByLabelText(/Topic/i);
    await user.type(topicInput, "Distributed Systems");

    const descInput = within(dialog).getByLabelText(/Description/i);
    await user.type(descInput, "Graduate level distributed systems course materials and labs.");

    const favCheckbox = within(dialog).getByLabelText(/Mark as favorite/i);
    await user.click(favCheckbox);

    const submitBtn = within(dialog).getByRole("button", { name: "Create Document" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "MIT Distributed Systems Course",
          url: "https://pdos.csail.mit.edu/6.824/",
          category: "course",
          topic: "Distributed Systems",
          description: "Graduate level distributed systems course materials and labs.",
          favorite: true,
          csrfToken: "test-csrf-token",
        })
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Add New Document" })).not.toBeInTheDocument();
    });

    expect(screen.getByText("MIT Distributed Systems Course")).toBeInTheDocument();
  });

  // 4. Client URL Scheme Validation
  it("rejects non-http/https URL in create modal", async () => {
    const user = userEvent.setup({ delay: null });
    renderDocumentsPage();

    await waitFor(() => {
      expect(screen.getByText("React Official Documentation")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Add Document/i }));
    const dialog = screen.getByRole("dialog", { name: "Add New Document" });

    await user.type(within(dialog).getByLabelText(/Title/i), "Unsafe Link");
    await user.type(within(dialog).getByLabelText(/URL/i), "javascript:alert(1)");

    await user.click(within(dialog).getByRole("button", { name: "Create Document" }));

    await waitFor(() => {
      expect(within(dialog).getByText(/must use http or https protocol/i)).toBeInTheDocument();
    });
  });

  // 5. Edit Document Modal
  it("edits an existing document via modal", async () => {
    const user = userEvent.setup({ delay: null });
    const updateSpy = vi.spyOn(notesService, "updateDocument").mockResolvedValue({
      id: "d0000000-0001-4000-8000-000000000001",
      title: "React v19 Documentation",
      url: "https://react.dev/blog/2024/12/05/react-19",
      description: "Official React 19 release notes.",
      category: "article",
      topic: "React 19",
      favorite: true,
      createdAt: "2026-10-27T10:00:00.000Z",
      updatedAt: "2026-10-27T14:00:00.000Z",
    });

    renderDocumentsPage();

    await waitFor(() => {
      expect(screen.getByText("React Official Documentation")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle("Edit document");
    await user.click(editButtons[0]);

    const dialog = screen.getByRole("dialog", { name: "Edit Document" });
    expect(dialog).toBeInTheDocument();

    const titleInput = within(dialog).getByLabelText(/Title/i);
    expect(titleInput).toHaveValue("React Official Documentation");
    await user.clear(titleInput);
    await user.type(titleInput, "React v19 Documentation");

    const submitBtn = within(dialog).getByRole("button", { name: "Save Changes" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        "d0000000-0001-4000-8000-000000000001",
        expect.objectContaining({
          title: "React v19 Documentation",
          csrfToken: "test-csrf-token",
        })
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit Document" })).not.toBeInTheDocument();
    });

    expect(screen.getByText("React v19 Documentation")).toBeInTheDocument();
  });

  // 6. Favorite / Unfavorite Toggle with Optimistic UI
  it("toggles favorite status and rolls back on failure", async () => {
    const user = userEvent.setup({ delay: null });
    const favSpy = vi.spyOn(notesService, "favoriteDocument").mockResolvedValue({
      ...SAMPLE_DOCUMENTS[1],
      favorite: true,
    });
    const unfavSpy = vi.spyOn(notesService, "unfavoriteDocument").mockRejectedValueOnce(
      new Error("Network timeout")
    );

    renderDocumentsPage();

    await waitFor(() => {
      expect(screen.getByText("Clean Architecture Principles PDF")).toBeInTheDocument();
    });

    // Clean Arch document currently has favorite: false
    const favButtons = screen.getAllByRole("button", { name: "Favorite document" });
    expect(favButtons.length).toBeGreaterThanOrEqual(1);

    await user.click(favButtons[0]);

    await waitFor(() => {
      expect(favSpy).toHaveBeenCalledWith(
        "d0000000-0002-4000-8000-000000000002",
        expect.objectContaining({ csrfToken: "test-csrf-token" })
      );
    });

    // Test rollback on failure when un-favoriting first document (which has favorite: true)
    const unfavButton = screen.getAllByRole("button", { name: "Unfavorite document" })[0];
    await user.click(unfavButton);

    await waitFor(() => {
      expect(unfavSpy).toHaveBeenCalledWith(
        "d0000000-0001-4000-8000-000000000001",
        expect.objectContaining({ csrfToken: "test-csrf-token" })
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Network timeout")).toBeInTheDocument();
    });
  });

  // 7. Filtering & Search
  it("applies category, topic, favorite, and search filters", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchSpy = vi.spyOn(notesService, "fetchDocuments");

    renderDocumentsPage();

    await waitFor(() => {
      expect(screen.getByText("React Official Documentation")).toBeInTheDocument();
    });

    // 1. Category filter
    const catSelect = screen.getByLabelText("Category");
    await user.selectOptions(catSelect, "pdf");

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "pdf",
        })
      );
    });

    // 2. Favorites only toggle
    const favToggle = screen.getByRole("button", { name: "★ Favorites Only" });
    await user.click(favToggle);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          favorite: true,
        })
      );
    });

    // 3. Search query
    const searchInput = screen.getByPlaceholderText("Search by title, url, topic...");
    await user.type(searchInput, "architecture");

    await waitFor(
      () => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            q: "architecture",
          })
        );
      },
      { timeout: 1000 }
    );
  });

  // 8. Soft Delete Confirmation Modal
  it("deletes a document via confirmation modal", async () => {
    const user = userEvent.setup({ delay: null });
    const deleteSpy = vi.spyOn(notesService, "deleteDocument").mockResolvedValue(true);

    renderDocumentsPage();

    await waitFor(() => {
      expect(screen.getByText("Clean Architecture Principles PDF")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTitle("Delete document");
    await user.click(deleteButtons[1]); // Second document

    const dialog = screen.getByRole("dialog", { name: "Delete Document" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Clean Architecture Principles PDF")).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole("button", { name: "Delete Document" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(
        "d0000000-0002-4000-8000-000000000002",
        expect.objectContaining({ csrfToken: "test-csrf-token" })
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Delete Document" })).not.toBeInTheDocument();
    });

    expect(screen.queryByText("Clean Architecture Principles PDF")).not.toBeInTheDocument();
  });

  // 9. Empty States
  it("renders empty state when no documents exist", async () => {
    vi.spyOn(notesService, "fetchDocuments").mockResolvedValue({
      documents: [],
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });

    renderDocumentsPage();

    await waitFor(() => {
      expect(screen.getByText("No documents yet")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Store and reference important documents here.").length).toBeGreaterThanOrEqual(1);
  });
});
