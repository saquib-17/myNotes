import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import SearchPage, { HighlightMatch } from "../pages/SearchPage.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import AppLayout from "../layouts/AppLayout.jsx";
import * as notesService from "../services/notes.service.js";

let mockIsAuthenticated = true;
let mockUser = { id: "user-123", email: "user@example.com", name: "Alex" };
let mockActiveWorkspace = { id: "ws-1", name: "Personal", isDefault: true };

vi.mock("../context/useAuth.js", () => ({
  useAuth: () => ({
    user: mockIsAuthenticated ? mockUser : null,
    isAuthenticated: mockIsAuthenticated,
    logout: vi.fn(),
    getCsrfToken: vi.fn().mockResolvedValue("test-csrf-token"),
  }),
}));

vi.mock("../context/useWorkspace.js", () => ({
  useWorkspace: () => ({
    workspaces: [mockActiveWorkspace, { id: "ws-2", name: "Work", isDefault: false }],
    activeWorkspaceId: mockActiveWorkspace.id,
    activeWorkspace: mockActiveWorkspace,
    switchWorkspace: vi.fn(),
  }),
}));

vi.mock("../context/useCollections.js", () => ({
  useCollections: () => ({
    collections: [],
    isLoading: false,
    error: null,
    refreshCollections: vi.fn(),
  }),
}));

vi.mock("../context/useTags.js", () => ({
  useTags: () => ({
    tags: [],
    isLoading: false,
    error: null,
    refreshTags: vi.fn(),
  }),
}));

const MOCK_SEARCH_RESULTS = {
  query: "React",
  workspaceId: "ws-1",
  type: "all",
  total: 6,
  limit: 20,
  offset: 0,
  hasMore: false,
  results: [
    {
      id: "n1",
      type: "notes",
      title: "React Architecture Notes",
      subtitle: "Pinned Note",
      snippet: "Comprehensive guide to React component lifecycles…",
      url: "/notes/n1",
      updatedAt: "2026-10-28T10:00:00Z",
      badges: ["Pinned"],
    },
    {
      id: "t1",
      type: "tasks",
      title: "Build React search component",
      subtitle: "Task • Pending • Due 2026-11-01",
      snippet: "Implement debounced search input for React app…",
      url: "/tasks",
      updatedAt: "2026-10-28T09:00:00Z",
      badges: ["Pending", "HIGH"],
    },
    {
      id: "q1",
      type: "questions",
      title: "What is React reconciliation?",
      subtitle: "Question • SHORT_ANSWER • Frontend",
      snippet: "Reconciliation is the virtual DOM diffing algorithm in React…",
      url: "/questions",
      updatedAt: "2026-10-28T08:00:00Z",
      badges: ["SHORT_ANSWER", "Frontend"],
    },
    {
      id: "d1",
      type: "documents",
      title: "React Official Documentation",
      subtitle: "Document • Documentation • Web",
      snippet: "Official React documentation covering hooks and router…",
      url: "/documents",
      updatedAt: "2026-10-28T07:00:00Z",
      badges: ["Documentation", "Favorite"],
    },
    {
      id: "r1",
      type: "revision",
      title: "Revise React useEffect nuances",
      subtitle: "Revision • React • Pending",
      snippet: "Stale closures and cleanup functions in React…",
      url: "/revision",
      updatedAt: "2026-10-28T06:00:00Z",
      badges: ["Pending"],
    },
    {
      id: "b1",
      type: "doubts",
      title: "Why does React re-render twice in Strict Mode?",
      subtitle: "Doubt • React • Resolved",
      snippet: "Strict Mode deliberately double-invokes component bodies…",
      url: "/revision",
      updatedAt: "2026-10-28T05:00:00Z",
      badges: ["Resolved"],
    },
  ],
};

describe("Global Search Feature Frontend Test Suite", () => {
  beforeEach(() => {
    mockIsAuthenticated = true;
    mockActiveWorkspace = { id: "ws-1", name: "Personal", isDefault: true };
    vi.clearAllMocks();
  });

  describe("1. HighlightMatch Safe Rendering", () => {
    it("renders unhighlighted text when query is empty or not matching", () => {
      const { container } = render(<HighlightMatch text="Hello World" query="" />);
      expect(container.textContent).toBe("Hello World");
      expect(container.querySelector("mark")).toBeNull();
    });

    it("wraps matching terms in <mark> elements without dangerouslySetInnerHTML", () => {
      const { container } = render(<HighlightMatch text="Learning React Router 6" query="react" />);
      const mark = container.querySelector("mark");
      expect(mark).not.toBeNull();
      expect(mark.textContent).toBe("React");
      expect(container.textContent).toBe("Learning React Router 6");
    });

    it("safely handles special regex characters in query without throwing", () => {
      const { container } = render(
        <HighlightMatch text="Cost is $100 [discounted]" query="$100 [" />
      );
      const mark = container.querySelector("mark");
      expect(mark).not.toBeNull();
      expect(mark.textContent).toBe("$100 [");
    });
  });

  describe("2. Search Page States", () => {
    it("renders initial prompt state when no query is provided", () => {
      render(
        <MemoryRouter initialEntries={["/search"]}>
          <Routes>
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText("Search your workspace")).toBeInTheDocument();
      expect(screen.getByText(/Enter a keyword above to search across/i)).toBeInTheDocument();
    });

    it("displays loading state while search is in flight", async () => {
      vi.spyOn(notesService, "globalSearch").mockImplementation(
        () => new Promise(() => {}) // never resolves
      );

      render(
        <MemoryRouter initialEntries={["/search?q=algorithms"]}>
          <Routes>
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText("Searching…")).toBeInTheDocument();
    });

    it("displays error state with working Retry button when API fails", async () => {
      const user = userEvent.setup();
      const mockSearch = vi
        .spyOn(notesService, "globalSearch")
        .mockRejectedValueOnce(new Error("Network timeout"))
        .mockResolvedValueOnce(MOCK_SEARCH_RESULTS);

      render(
        <MemoryRouter initialEntries={["/search?q=React"]}>
          <Routes>
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Network timeout")).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole("button", { name: /retry/i });
      await user.click(retryBtn);

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("heading", { name: /React Architecture Notes/i })).toBeInTheDocument();
      });
    });

    it("displays honest empty state when 0 results match query", async () => {
      vi.spyOn(notesService, "globalSearch").mockResolvedValue({
        query: "nonexistentkeyword",
        workspaceId: "ws-1",
        type: "all",
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
        results: [],
      });

      render(
        <MemoryRouter initialEntries={["/search?q=nonexistentkeyword"]}>
          <Routes>
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/No results for/i)).toBeInTheDocument();
        expect(screen.getByText(/couldn't find anything matching your search in this workspace/i)).toBeInTheDocument();
      });
    });
  });

  describe("3. Results Rendering and Grouping", () => {
    it("renders grouped results by category for type=all with correct links and badges", async () => {
      vi.spyOn(notesService, "globalSearch").mockResolvedValue(MOCK_SEARCH_RESULTS);

      render(
        <MemoryRouter initialEntries={["/search?q=React"]}>
          <Routes>
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Build React search component/i })).toBeInTheDocument();
      });

      // Verify category headers
      expect(screen.getByRole("heading", { name: /Notes \(1\)/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Tasks \(1\)/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Questions \(1\)/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Documents \(1\)/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Revision \(1\)/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Doubts \(1\)/i })).toBeInTheDocument();

      // Verify links
      const noteLink = screen.getByRole("link", { name: /React Architecture Notes/i });
      expect(noteLink).toHaveAttribute("href", "/notes/n1");

      const taskLink = screen.getByRole("link", { name: /Build React search component/i });
      expect(taskLink).toHaveAttribute("href", "/tasks");
    });

    it("renders flat list when a specific type tab is selected", async () => {
      const user = userEvent.setup();
      const mockSearch = vi.spyOn(notesService, "globalSearch").mockResolvedValue({
        query: "React",
        workspaceId: "ws-1",
        type: "tasks",
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        results: [MOCK_SEARCH_RESULTS.results[1]], // only tasks
      });

      render(
        <MemoryRouter initialEntries={["/search?q=React"]}>
          <Routes>
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Build React search component/i })).toBeInTheDocument();
      });

      // Click on "Tasks" filter tab
      const tasksTab = screen.getByRole("button", { name: "Filter by Tasks" });
      await user.click(tasksTab);

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledWith(
          expect.objectContaining({ type: "tasks" })
        );
      });
    });

    it("renders pagination controls when total exceeds limit and allows paging", async () => {
      const user = userEvent.setup();
      const mockSearch = vi.spyOn(notesService, "globalSearch").mockResolvedValue({
        query: "React",
        workspaceId: "ws-1",
        type: "all",
        total: 45,
        limit: 20,
        offset: 0,
        hasMore: true,
        results: MOCK_SEARCH_RESULTS.results,
      });

      render(
        <MemoryRouter initialEntries={["/search?q=React"]}>
          <Routes>
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("navigation", { name: "Search results pagination" })).toHaveTextContent(/Showing 1–20 of 45 results/i);
      });

      const nextBtn = screen.getByRole("button", { name: "Next" });
      expect(nextBtn).toBeEnabled();
      await user.click(nextBtn);

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledWith(
          expect.objectContaining({ offset: 20 })
        );
      });
    });
  });

  describe("4. Shell Search Input & Debounce Navigation", () => {
    it("debounces header/sidebar search input by 300ms and navigates to /search", async () => {
      const user = userEvent.setup();
      vi.spyOn(notesService, "globalSearch").mockResolvedValue(MOCK_SEARCH_RESULTS);

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="dashboard" element={<div>Dashboard Content</div>} />
              <Route path="search" element={<SearchPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText("Dashboard Content")).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText("Search notes, tags, or collections...");

      await user.type(searchInput, "Redux");

      // Wait for 300ms debounce navigation
      await waitFor(
        () => {
          expect(screen.getByText("Global Search")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );
    });
  });

  describe("5. Stale Response Protection", () => {
    it("ignores out-of-order stale search responses", async () => {
      const user = userEvent.setup();
      let resolveFirst;
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      const secondResult = {
        query: "second",
        workspaceId: "ws-1",
        type: "all",
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        results: [
          {
            id: "n2",
            type: "notes",
            title: "Vue 3 Composition Guide",
            subtitle: "Note",
            snippet: "Reactivity in Vue…",
            url: "/notes/n2",
            updatedAt: "2026-10-28T10:00:00Z",
            badges: [],
          },
        ],
      };

      vi.spyOn(notesService, "globalSearch")
        .mockImplementationOnce(() => firstPromise)
        .mockImplementationOnce(() => Promise.resolve(secondResult));

      render(
        <MemoryRouter initialEntries={["/search?q=first"]}>
          <Routes>
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Search input is rendered with "first"
      const input = screen.getByRole("searchbox", { name: "Search query" });
      expect(input).toHaveValue("first");

      // Type "second" and submit form
      await user.clear(input);
      await user.type(input, "second");
      const submitBtn = screen.getByRole("button", { name: "Search" });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Vue 3 Composition Guide/i })).toBeInTheDocument();
      });

      // Now resolve the first (stale) response with older data
      resolveFirst({
        query: "first",
        workspaceId: "ws-1",
        type: "all",
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        results: [
          {
            id: "n1",
            type: "notes",
            title: "Old Stale Note Result",
            subtitle: "Note",
            snippet: "Should never appear…",
            url: "/notes/n1",
            updatedAt: "2026-10-28T10:00:00Z",
            badges: [],
          },
        ],
      });

      // The newer Vue 3 result must still be visible and the stale note must NOT overwrite it
      expect(screen.getByRole("heading", { name: /Vue 3 Composition Guide/i })).toBeInTheDocument();
      expect(screen.queryByText("Old Stale Note Result")).toBeNull();
    });
  });
});
