import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RevisionPage from "../pages/RevisionPage.jsx";
import DocumentsPage from "../pages/DocumentsPage.jsx";
import TasksPage from "../pages/TasksPage.jsx";
import DashboardPage from "../pages/DashboardPage.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import * as notesService from "../services/notes.service.js";

const mockGetCsrfToken = vi.fn().mockResolvedValue("csrf-token-stability");
let mockIsAuthenticated = true;

vi.mock("../context/useAuth.js", () => ({
  useAuth: () => ({
    user: mockIsAuthenticated ? { id: "user-100", email: "audit@example.com", name: "Audit User" } : null,
    isAuthenticated: mockIsAuthenticated,
    getCsrfToken: mockGetCsrfToken,
    logout: vi.fn(),
  }),
}));

describe("Cross-Feature Stability and UX Consistency Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
  });

  // 1. Specific Empty States Consistency
  describe("1. Specific Empty States Consistency", () => {
    it("renders 'No revision items yet' on Revision tab when empty", async () => {
      vi.spyOn(notesService, "fetchRevisionItems").mockResolvedValue({
        items: [],
        total: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/revision"]}>
          <Routes>
            <Route path="/revision" element={<ProtectedRoute><RevisionPage /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("No revision items yet")).toBeInTheDocument();
      });
    });

    it("renders 'No doubts yet' on Doubts tab when empty", async () => {
      vi.spyOn(notesService, "fetchRevisionItems").mockResolvedValue({
        items: [],
        total: 0,
        hasMore: false,
      });
      vi.spyOn(notesService, "fetchDoubts").mockResolvedValue({
        items: [],
        total: 0,
        hasMore: false,
      });

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/revision"]}>
          <Routes>
            <Route path="/revision" element={<ProtectedRoute><RevisionPage /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      const doubtsTab = await screen.findByRole("tab", { name: /doubts/i });
      await user.click(doubtsTab);

      await waitFor(() => {
        expect(screen.getByText("No doubts yet")).toBeInTheDocument();
      });
    });

    it("renders 'No documents yet' on Documents page when empty", async () => {
      vi.spyOn(notesService, "fetchDocuments").mockResolvedValue({
        documents: [],
        total: 0,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/documents"]}>
          <Routes>
            <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("No documents yet")).toBeInTheDocument();
      });
    });

    it("renders 'No pending tasks' and 'No completed tasks' when filtered", async () => {
      vi.spyOn(notesService, "fetchTasks").mockResolvedValue({
        tasks: [],
        total: 0,
        hasMore: false,
      });

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/tasks"]}>
          <Routes>
            <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      const pendingFilter = await screen.findByRole("button", { name: /^pending$/i });
      await user.click(pendingFilter);

      await waitFor(() => {
        expect(screen.getByText("No pending tasks")).toBeInTheDocument();
      });

      const completedFilter = screen.getByRole("button", { name: /^completed$/i });
      await user.click(completedFilter);

      await waitFor(() => {
        expect(screen.getByText("No completed tasks")).toBeInTheDocument();
      });
    });
  });

  // 2. External Link Security & Accessibility
  describe("2. External Link Security & Accessibility", () => {
    it("ensures document links open in new tab with target='_blank' and rel='noopener noreferrer'", async () => {
      vi.spyOn(notesService, "fetchDocuments").mockResolvedValue({
        documents: [
          {
            id: "doc-1",
            title: "PostgreSQL Official Documentation",
            url: "https://www.postgresql.org/docs/",
            category: "documentation",
            topic: "Database",
            favorite: false,
            updatedAt: "2026-10-28T05:00:00Z",
          },
        ],
        total: 1,
        hasMore: false,
      });

      render(
        <MemoryRouter initialEntries={["/documents"]}>
          <Routes>
            <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      const docLink = await screen.findByRole("link", { name: /PostgreSQL Official Documentation/i });
      expect(docLink).toHaveAttribute("target", "_blank");
      expect(docLink).toHaveAttribute("rel", "noopener noreferrer");
      expect(docLink).toHaveAttribute("href", "https://www.postgresql.org/docs/");
    });

    it("ensures dashboard recent document links use safe target='_blank' and rel='noopener noreferrer'", async () => {
      vi.spyOn(notesService, "fetchDashboardOverview").mockResolvedValue({
        date: "2026-10-28",
        user: { id: "user-100", name: "Audit User", email: "audit@example.com" },
        stats: {},
        today: {},
        focus: {},
        recent: {
          documents: [
            {
              id: "doc-2",
              title: "React 19 Documentation",
              url: "https://react.dev",
              category: "documentation",
              favorite: true,
            },
          ],
        },
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      const docLink = await screen.findByRole("link", { name: /React 19 Documentation/i });
      expect(docLink).toHaveAttribute("target", "_blank");
      expect(docLink).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  // 3. Optimistic Updates Rollback
  describe("3. Optimistic Updates Rollback on Failure", () => {
    it("rolls back document favorite toggle if API request fails", async () => {
      const docItem = {
        id: "doc-fail-1",
        title: "Test Architecture Spec",
        url: "https://example.com/spec",
        category: "article",
        favorite: false,
        updatedAt: "2026-10-28T05:00:00Z",
      };

      vi.spyOn(notesService, "fetchDocuments").mockResolvedValue({
        documents: [docItem],
        total: 1,
        hasMore: false,
      });

      vi.spyOn(notesService, "favoriteDocument").mockRejectedValue(
        new Error("Network connection dropped.")
      );

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/documents"]}>
          <Routes>
            <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      const favButton = await screen.findByLabelText(/favorite document/i);
      expect(favButton).toHaveTextContent("☆");

      await user.click(favButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Network connection dropped.");
      });

      // Verify rolled back to original un-favorited state
      expect(favButton).toHaveTextContent("☆");
    });

    it("rolls back revision item status toggle if API request fails", async () => {
      const revItem = {
        id: "rev-fail-1",
        title: "Dynamic Programming Knapsack",
        subject: "DSA",
        status: "pending",
        revised_at: null,
      };

      vi.spyOn(notesService, "fetchRevisionItems").mockResolvedValue({
        revision_items: [revItem],
        revisionItems: [revItem],
        items: [revItem],
        total: 1,
        hasMore: false,
      });

      vi.spyOn(notesService, "markRevisionItemRevised").mockRejectedValue(
        new Error("Server error marking revised.")
      );

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/revision"]}>
          <Routes>
            <Route path="/revision" element={<ProtectedRoute><RevisionPage /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      const markRevisedBtn = await screen.findByRole("button", { name: "Mark Revised" });
      await user.click(markRevisedBtn);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Server error marking revised.");
      });

      // Status button reverts back to "Mark Revised" (and not "Reopen")
      expect(screen.getByRole("button", { name: "Mark Revised" })).toBeInTheDocument();
    });
  });

  // 4. Modal Accessibility Basics
  describe("4. Modal Accessibility & Controls", () => {
    it("ensures Documents Page delete modal has role='dialog', aria-modal='true', and accessible cancel/delete buttons", async () => {
      vi.spyOn(notesService, "fetchDocuments").mockResolvedValue({
        documents: [
          {
            id: "doc-modal-1",
            title: "Microservices Design Guide",
            url: "https://example.com/guide",
            category: "pdf",
            favorite: false,
          },
        ],
        total: 1,
        hasMore: false,
      });

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/documents"]}>
          <Routes>
            <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      const deleteIconBtn = await screen.findByLabelText(/Delete document "Microservices Design Guide"/i);
      await user.click(deleteIconBtn);

      const modal = screen.getByRole("dialog");
      expect(modal).toHaveAttribute("aria-modal", "true");
      expect(within(modal).getByRole("heading", { name: /delete document/i })).toBeInTheDocument();
      expect(within(modal).getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
      expect(within(modal).getByRole("button", { name: /delete document/i })).toBeInTheDocument();
    });

    it("ensures Tasks Page edit modal has accessible controls including aria-label for clear due date", async () => {
      vi.spyOn(notesService, "fetchTasks").mockResolvedValue({
        tasks: [
          {
            id: "task-modal-1",
            title: "Prepare Slide Deck",
            priority: "high",
            dueDate: "2026-10-30",
            status: "pending",
          },
        ],
        total: 1,
        hasMore: false,
      });

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/tasks"]}>
          <Routes>
            <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      );

      const editBtn = await screen.findByLabelText(/Edit task "Prepare Slide Deck"/i);
      await user.click(editBtn);

      const modal = screen.getByRole("dialog");
      expect(modal).toHaveAttribute("aria-modal", "true");
      expect(within(modal).getByLabelText("Clear due date")).toBeInTheDocument();
    });
  });
});
