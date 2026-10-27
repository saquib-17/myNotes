import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import TasksPage from "../pages/TasksPage.jsx";
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

const SAMPLE_TASKS = [
  {
    id: "7a540000-0001-4000-8000-000000000001",
    title: "Finish compiler project",
    details: "Implement AST visitor pattern",
    status: "pending",
    priority: "high",
    dueDate: "2026-10-25", // Overdue relative to 2026-10-27
    completedAt: null,
    createdAt: "2026-10-26T10:00:00.000Z",
    updatedAt: "2026-10-26T10:00:00.000Z",
  },
  {
    id: "7a540000-0002-4000-8000-000000000002",
    title: "Review mock interviews",
    details: null,
    status: "pending",
    priority: "medium",
    dueDate: "2026-11-10",
    completedAt: null,
    createdAt: "2026-10-26T11:00:00.000Z",
    updatedAt: "2026-10-26T11:00:00.000Z",
  },
  {
    id: "7a540000-0003-4000-8000-000000000003",
    title: "Submit weekly report",
    details: "All numbers accounted for",
    status: "completed",
    priority: "low",
    dueDate: null,
    completedAt: "2026-10-27T09:00:00.000Z",
    createdAt: "2026-10-26T08:00:00.000Z",
    updatedAt: "2026-10-27T09:00:00.000Z",
  },
];

function renderTasksPage({ initialEntries = ["/tasks"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <TasksPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page Mock</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Tasks Feature Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    vi.spyOn(notesService, "fetchTasks").mockResolvedValue({
      tasks: [...SAMPLE_TASKS],
      items: [...SAMPLE_TASKS],
      total: SAMPLE_TASKS.length,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
  });

  // 1. Protected Route
  it("redirects unauthenticated users to /login", async () => {
    mockIsAuthenticated = false;
    renderTasksPage();

    await waitFor(() => {
      expect(screen.getByText("Login Page Mock")).toBeInTheDocument();
    });
  });

  // 2. Listing, Badges, and Overdue indicator
  it("renders tasks with title, priority badges, details, and overdue indicators", async () => {
    renderTasksPage();

    await waitFor(() => {
      expect(screen.getByText("Finish compiler project")).toBeInTheDocument();
    });

    expect(screen.getByText("Review mock interviews")).toBeInTheDocument();
    expect(screen.getByText("Submit weekly report")).toBeInTheDocument();

    // High and medium priority badges
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();

    // Details
    expect(screen.getByText("Implement AST visitor pattern")).toBeInTheDocument();

    // Overdue indicator
    expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
  });

  // 3. Quick-Add Task Creation
  it("creates a task using the quick-add bar", async () => {
    const user = userEvent.setup();
    const createTaskSpy = vi.spyOn(notesService, "createTask").mockResolvedValue({
      id: "7a540000-0004-4000-8000-000000000004",
      title: "Prepare sliding window slides",
      details: null,
      status: "pending",
      priority: "high",
      dueDate: "2026-11-01",
      completedAt: null,
      createdAt: "2026-10-27T12:00:00.000Z",
      updatedAt: "2026-10-27T12:00:00.000Z",
    });

    renderTasksPage();

    await waitFor(() => {
      expect(screen.getByText("Finish compiler project")).toBeInTheDocument();
    });

    const titleInput = screen.getByLabelText("New task title");
    await user.type(titleInput, "Prepare sliding window slides");

    const prioritySelect = screen.getByLabelText("New task priority");
    await user.selectOptions(prioritySelect, "high");

    const submitBtn = screen.getByRole("button", { name: "Add Task" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createTaskSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Prepare sliding window slides",
          priority: "high",
          csrfToken: "test-csrf-token",
        })
      );
    });

    expect(titleInput.value).toBe("");
  });

  // 4. Complete and Reopen Task (Optimistic update)
  it("toggles task complete and reopen with optimistic update", async () => {
    const user = userEvent.setup();
    const completeSpy = vi.spyOn(notesService, "completeTask").mockResolvedValue({
      task: { ...SAMPLE_TASKS[0], status: "completed", completedAt: new Date().toISOString() },
    });
    const reopenSpy = vi.spyOn(notesService, "reopenTask").mockResolvedValue({
      task: { ...SAMPLE_TASKS[2], status: "pending", completedAt: null },
    });

    renderTasksPage();

    await waitFor(() => {
      expect(screen.getByText("Finish compiler project")).toBeInTheDocument();
    });

    // Complete pending task
    const completeBtn = screen.getByLabelText('Mark "Finish compiler project" as completed');
    await user.click(completeBtn);

    await waitFor(() => {
      expect(completeSpy).toHaveBeenCalledWith(SAMPLE_TASKS[0].id, {
        csrfToken: "test-csrf-token",
      });
    });

    // Reopen completed task
    const reopenBtn = screen.getByLabelText('Mark "Submit weekly report" as pending');
    await user.click(reopenBtn);

    await waitFor(() => {
      expect(reopenSpy).toHaveBeenCalledWith(SAMPLE_TASKS[2].id, {
        csrfToken: "test-csrf-token",
      });
    });
  });

  // 5. Edit Task Modal
  it("opens edit modal, edits fields, and submits changes", async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(notesService, "updateTask").mockResolvedValue({
      id: SAMPLE_TASKS[1].id,
      title: "Review mock interviews with mentor",
      details: "Focus on system design questions",
      status: "pending",
      priority: "high",
      dueDate: "2026-11-12",
      completedAt: null,
      createdAt: SAMPLE_TASKS[1].createdAt,
      updatedAt: new Date().toISOString(),
    });

    renderTasksPage();

    await waitFor(() => {
      expect(screen.getByText("Review mock interviews")).toBeInTheDocument();
    });

    const editBtn = screen.getByLabelText('Edit task "Review mock interviews"');
    await user.click(editBtn);

    const dialog = screen.getByRole("dialog", { name: "Edit Task" });
    expect(dialog).toBeInTheDocument();

    const titleInput = within(dialog).getByLabelText(/Title/);
    await user.clear(titleInput);
    await user.type(titleInput, "Review mock interviews with mentor");

    const detailsInput = within(dialog).getByLabelText(/Details/);
    await user.type(detailsInput, "Focus on system design questions");

    const prioritySelect = within(dialog).getByLabelText(/Priority/);
    await user.selectOptions(prioritySelect, "high");

    const saveBtn = within(dialog).getByRole("button", { name: "Save Changes" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        SAMPLE_TASKS[1].id,
        expect.objectContaining({
          title: "Review mock interviews with mentor",
          details: "Focus on system design questions",
          priority: "high",
          csrfToken: "test-csrf-token",
        })
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit Task" })).not.toBeInTheDocument();
    });
  });

  // 6. Delete Task with Confirmation Modal
  it("opens delete confirmation modal and soft-deletes task", async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.spyOn(notesService, "deleteTask").mockResolvedValue(true);

    renderTasksPage();

    await waitFor(() => {
      expect(screen.getByText("Submit weekly report")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByLabelText('Delete task "Submit weekly report"');
    await user.click(deleteBtn);

    const dialog = screen.getByRole("dialog", { name: "Delete Task" });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText(/This task will be moved to a deleted state/i)
    ).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole("button", { name: "Delete Task" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(SAMPLE_TASKS[2].id, {
        csrfToken: "test-csrf-token",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Submit weekly report")).not.toBeInTheDocument();
    });
  });

  // 7. Empty States for Filters and Search
  it("displays empty state when status or search filter has no matching tasks", async () => {
    const user = userEvent.setup();
    vi.spyOn(notesService, "fetchTasks").mockResolvedValue({
      tasks: [],
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });

    renderTasksPage();

    // Click Pending filter tab
    const pendingTab = screen.getByRole("button", { name: "Pending" });
    await user.click(pendingTab);

    await waitFor(() => {
      expect(screen.getByText("No pending tasks")).toBeInTheDocument();
    });

    // Click Completed filter tab
    const completedTab = screen.getByRole("button", { name: "Completed" });
    await user.click(completedTab);

    await waitFor(() => {
      expect(screen.getByText("No completed tasks")).toBeInTheDocument();
    });

    // Type search query
    const searchInput = screen.getByLabelText("Search tasks");
    await user.type(searchInput, "nonexistent query");

    await waitFor(() => {
      expect(
        screen.getByText(/No tasks matching ‘nonexistent query’/i)
      ).toBeInTheDocument();
    });
  });

  // 8. Optimistic Update Rollback on Failure
  it("rolls back status toggle and displays error banner when API call fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(notesService, "completeTask").mockRejectedValue(
      new Error("Network connection dropped")
    );

    renderTasksPage();

    await waitFor(() => {
      expect(screen.getByText("Finish compiler project")).toBeInTheDocument();
    });

    const completeBtn = screen.getByLabelText('Mark "Finish compiler project" as completed');
    await user.click(completeBtn);

    // Rollback error displayed
    await waitFor(() => {
      expect(
        screen.getByText(/Failed to update task status: Network connection dropped/i)
      ).toBeInTheDocument();
    });

    // Status button still shows uncompleted
    expect(
      screen.getByLabelText('Mark "Finish compiler project" as completed')
    ).toBeInTheDocument();
  });
});

