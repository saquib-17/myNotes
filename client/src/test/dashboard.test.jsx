import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "../pages/DashboardPage.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import * as notesService from "../services/notes.service.js";

let mockIsAuthenticated = true;
let mockUser = { id: "user-123", email: "user@example.com", name: "Alex" };

vi.mock("../context/useAuth.js", () => ({
  useAuth: () => ({
    user: mockIsAuthenticated ? mockUser : null,
    isAuthenticated: mockIsAuthenticated,
    logout: vi.fn(),
  }),
}));

const MOCK_DASHBOARD_DATA = {
  date: "2026-10-28",
  user: {
    id: "user-123",
    email: "user@example.com",
    name: "Alex",
  },
  stats: {
    activeNotes: 12,
    pinnedNotes: 3,
    pendingTasks: 4,
    completedTasks: 8,
    openDoubts: 2,
    pendingRevisionItems: 5,
    totalQuestions: 15,
    learningQuestions: 6,
    masteredQuestions: 7,
    favoriteDocuments: 4,
    journalEntries: 10,
  },
  today: {
    journalSaved: true,
    dueTasks: [
      { id: "t1", title: "Review B-Tree index locking", priority: "high", due_date: "2026-10-28" },
      { id: "t2", title: "Practice React 19 transition hook", priority: "medium", due_date: "2026-10-28" },
    ],
    overdueTasks: [
      { id: "t3", title: "Submit mock interview feedback", priority: "high", due_date: "2026-10-26" },
    ],
  },
  focus: {
    tasks: [
      { id: "t1", title: "Review B-Tree index locking", priority: "high", due_date: "2026-10-28" },
      { id: "t4", title: "Read system design chapter 4", priority: "low", due_date: "2026-10-30" },
    ],
    doubts: [
      { id: "d1", question: "Why does PostgreSQL create separate TOAST table?", subject: "Databases" },
    ],
    revisionItems: [
      { id: "r1", title: "Dijkstra algorithm complexity", subject: "Algorithms" },
    ],
  },
  recent: {
    notes: [
      { id: "n1", title: "Concurrency Models in Node.js", pinned: true, updated_at: "2026-10-28T05:00:00Z" },
    ],
    questions: [
      { id: "q1", type: "CODING", question: "LRU Cache implementation in Java", status: "learning" },
    ],
    documents: [
      { id: "doc1", title: "PostgreSQL Concurrency Control Docs", category: "documentation", favorite: true },
    ],
  },
};

const EMPTY_DASHBOARD_DATA = {
  date: "2026-10-28",
  user: {
    id: "user-123",
    email: "user@example.com",
    name: "Alex",
  },
  stats: {
    activeNotes: 0,
    pinnedNotes: 0,
    pendingTasks: 0,
    completedTasks: 0,
    openDoubts: 0,
    pendingRevisionItems: 0,
    totalQuestions: 0,
    learningQuestions: 0,
    masteredQuestions: 0,
    favoriteDocuments: 0,
    journalEntries: 0,
  },
  today: {
    journalSaved: false,
    dueTasks: [],
    overdueTasks: [],
  },
  focus: {
    tasks: [],
    doubts: [],
    revisionItems: [],
  },
  recent: {
    notes: [],
    questions: [],
    documents: [],
  },
};

function renderDashboardPage({ initialEntries = ["/dashboard"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page Mock</div>} />
        <Route path="/notes" element={<div>Notes Page Mock</div>} />
        <Route path="/tasks" element={<div>Tasks Page Mock</div>} />
        <Route path="/questions" element={<div>Questions Page Mock</div>} />
        <Route path="/documents" element={<div>Documents Page Mock</div>} />
        <Route path="/revision" element={<div>Revision Page Mock</div>} />
        <Route path="/journal" element={<div>Journal Page Mock</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Dashboard Overview Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockUser = { id: "user-123", email: "user@example.com", name: "Alex" };
  });

  // 1. Protected Route Enforcement
  it("redirects unauthenticated users to /login", async () => {
    mockIsAuthenticated = false;
    renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("Login Page Mock")).toBeInTheDocument();
    });
  });

  // 2. Welcoming header & user name
  it("renders welcoming greeting with user name and formatted date", async () => {
    vi.spyOn(notesService, "fetchDashboardOverview").mockResolvedValue(MOCK_DASHBOARD_DATA);
    renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText(/welcome back, alex/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/wednesday, october 28, 2026/i)).toBeInTheDocument();
  });

  // 3. Quick Stats Grid
  it("renders stats overview cards with real counts", async () => {
    vi.spyOn(notesService, "fetchDashboardOverview").mockResolvedValue(MOCK_DASHBOARD_DATA);
    renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("12")).toBeInTheDocument(); // active notes
    });
    expect(screen.getByText("(3 pinned)")).toBeInTheDocument();
    expect(screen.getByText("8 completed")).toBeInTheDocument();
    expect(screen.getByText(/6 learning • 7 mastered/i)).toBeInTheDocument();
  });

  // 4. Quick Action Shortcuts
  it("renders quick action shortcut links to all workspaces", async () => {
    vi.spyOn(notesService, "fetchDashboardOverview").mockResolvedValue(MOCK_DASHBOARD_DATA);
    renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /\+ New Note/i })).toHaveAttribute("href", "/notes");
    });
    expect(screen.getByRole("link", { name: /\+ Add Task/i })).toHaveAttribute("href", "/tasks");
    expect(screen.getByRole("link", { name: /\+ Add Question/i })).toHaveAttribute("href", "/questions");
    expect(screen.getByRole("link", { name: /\+ Add Document/i })).toHaveAttribute("href", "/documents");
    expect(screen.getByRole("link", { name: /✎ Write Journal/i })).toHaveAttribute("href", "/journal");
    expect(screen.getByRole("link", { name: /↻ Review Revision & Doubts/i })).toHaveAttribute("href", "/revision");
  });

  // 5. Today's Focus: Journal, Due Tasks, Overdue Tasks
  it("renders today's focus section with saved journal, due tasks, and overdue tasks", async () => {
    vi.spyOn(notesService, "fetchDashboardOverview").mockResolvedValue(MOCK_DASHBOARD_DATA);
    renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText(/journal saved today/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /view today's journal/i })).toHaveAttribute("href", "/journal");
    expect(screen.getAllByText("Review B-Tree index locking").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Submit mock interview feedback")).toBeInTheDocument();
    expect(screen.getByText("Due 2026-10-26")).toBeInTheDocument();
  });

  // 6. Focus & Attention and Recent Activity
  it("renders focus attention items and recent workspace activity", async () => {
    vi.spyOn(notesService, "fetchDashboardOverview").mockResolvedValue(MOCK_DASHBOARD_DATA);
    renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("Why does PostgreSQL create separate TOAST table?")).toBeInTheDocument();
    });
    expect(screen.getByText("Dijkstra algorithm complexity")).toBeInTheDocument();
    expect(screen.getByText("Concurrency Models in Node.js")).toBeInTheDocument();
    expect(screen.getByText("LRU Cache implementation in Java")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL Concurrency Control Docs")).toBeInTheDocument();
  });

  // 7. Graceful Empty States
  it("renders graceful empty states when user has no active items", async () => {
    vi.spyOn(notesService, "fetchDashboardOverview").mockResolvedValue(EMPTY_DASHBOARD_DATA);
    renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText(/not written yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /write today's journal/i })).toHaveAttribute("href", "/journal");
    expect(screen.getByText("No tasks due today.")).toBeInTheDocument();
    expect(screen.getByText("No overdue tasks.")).toBeInTheDocument();
    expect(screen.getByText("No pending tasks.")).toBeInTheDocument();
    expect(screen.getByText("No open doubts.")).toBeInTheDocument();
    expect(screen.getByText("No pending revision items.")).toBeInTheDocument();
    expect(screen.getByText("No active notes yet.")).toBeInTheDocument();
    expect(screen.getByText("No questions recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No documents saved yet.")).toBeInTheDocument();
  });

  // 8. Error handling and retry
  it("displays error banner and refetches when user clicks retry", async () => {
    const fetchSpy = vi.spyOn(notesService, "fetchDashboardOverview")
      .mockRejectedValueOnce(new Error("Database connection timed out."))
      .mockResolvedValueOnce(MOCK_DASHBOARD_DATA);

    renderDashboardPage();

    const alertEl = await screen.findByTestId("dashboard-error-banner");
    expect(alertEl).toHaveTextContent("Database connection timed out.");

    const retryBtn = within(alertEl).getByRole("button", { name: /retry/i });
    await userEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/welcome back, alex/i)).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
