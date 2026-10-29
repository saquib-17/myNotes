import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "../context/useAuth.js";
import {
  fetchTasks,
  createTask,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
  TASK_LIMITS,
} from "../services/notes.service.js";
import EmptyState from "../components/EmptyState.jsx";

const PAGE_SIZE = 20;

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * TasksPage - Personal Task Inbox with full lifecycle management.
 * Authenticated, CSRF-protected, client-side date comparison for overdue status,
 * optimistic toggling with rollback, and stale response guards.
 * Styled with Midnight Indigo tokens and dark mode support.
 */
export default function TasksPage() {
  const { getCsrfToken } = useAuth();

  // Tasks and pagination state
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [operationError, setOperationError] = useState(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'pending' | 'completed'
  const [priorityFilter, setPriorityFilter] = useState("all"); // 'all' | 'high' | 'medium' | 'low' | 'none'
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Quick-Add form state
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState("none");
  const [quickDueDate, setQuickDueDate] = useState("");
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);
  const [quickAddError, setQuickAddError] = useState(null);

  // Edit Modal state
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [editPriority, setEditPriority] = useState("none");
  const [editDueDate, setEditDueDate] = useState("");
  const [editStatus, setEditStatus] = useState("pending");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  // Delete Confirmation Modal state
  const [deletingTask, setDeletingTask] = useState(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Generation reference to guard against stale responses
  const fetchGenerationRef = useRef(0);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load tasks callback
  const loadTasks = useCallback(
    async (signal) => {
      const currentGen = ++fetchGenerationRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const queryParams = {
          limit: PAGE_SIZE,
          offset,
          signal,
        };
        if (statusFilter !== "all") {
          queryParams.status = statusFilter;
        }
        if (priorityFilter !== "all") {
          queryParams.priority = priorityFilter;
        }
        if (debouncedQuery) {
          queryParams.q = debouncedQuery;
        }

        const data = await fetchTasks(queryParams);

        if (fetchGenerationRef.current !== currentGen || signal?.aborted) {
          return;
        }

        const rawList = Array.isArray(data.tasks)
          ? data.tasks
          : Array.isArray(data.items)
          ? data.items
          : [];

        const totalCount =
          typeof data.total === "number" ? data.total : offset + rawList.length;

        // Auto-recover if offset is beyond available items
        if (offset > 0 && rawList.length === 0 && totalCount > 0) {
          const lastValidOffset =
            Math.floor((totalCount - 1) / PAGE_SIZE) * PAGE_SIZE;
          if (lastValidOffset !== offset) {
            setOffset(lastValidOffset);
            return;
          }
        }

        setTasks(rawList);
        setTotal(totalCount);
        setHasMore(Boolean(data.hasMore));
      } catch (err) {
        if (
          fetchGenerationRef.current !== currentGen ||
          signal?.aborted ||
          err.name === "AbortError"
        ) {
          return;
        }
        setError(err?.message || "Could not load tasks from server.");
      } finally {
        if (fetchGenerationRef.current === currentGen) {
          setIsLoading(false);
        }
      }
    },
    [offset, statusFilter, priorityFilter, debouncedQuery]
  );

  // Fetch when filters or pagination change
  useEffect(() => {
    const controller = new AbortController();
    loadTasks(controller.signal);
    return () => controller.abort();
  }, [loadTasks]);

  // Reset offset to 0 when status or priority filter changes
  const handleStatusFilterChange = (newStatus) => {
    setStatusFilter(newStatus);
    setOffset(0);
  };

  const handlePriorityFilterChange = (newPriority) => {
    setPriorityFilter(newPriority);
    setOffset(0);
  };

  // Quick-Add submission handler
  const handleQuickAdd = async (e) => {
    e.preventDefault();
    const trimmedTitle = quickTitle.trim();
    if (!trimmedTitle) {
      setQuickAddError("Task title cannot be empty.");
      return;
    }
    if (trimmedTitle.length > TASK_LIMITS.MAX_TITLE_LENGTH) {
      setQuickAddError(
        `Task title cannot exceed ${TASK_LIMITS.MAX_TITLE_LENGTH} characters.`
      );
      return;
    }

    setIsSubmittingQuick(true);
    setQuickAddError(null);
    setOperationError(null);

    try {
      const csrfToken = await getCsrfToken();
      await createTask({
        title: trimmedTitle,
        priority: quickPriority,
        dueDate: quickDueDate || null,
        csrfToken,
      });

      setQuickTitle("");
      setQuickPriority("none");
      setQuickDueDate("");
      await loadTasks();
    } catch (err) {
      setQuickAddError(err?.message || "Failed to create task.");
    } finally {
      setIsSubmittingQuick(false);
    }
  };

  // Optimistic Toggle complete / reopen
  const handleToggleTaskStatus = async (task) => {
    const isCompleted = task.status === "completed";
    const newStatus = isCompleted ? "pending" : "completed";
    const previousTasks = [...tasks];
    setOperationError(null);

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: newStatus,
              completedAt: newStatus === "completed" ? new Date().toISOString() : null,
            }
          : t
      )
    );

    try {
      const csrfToken = await getCsrfToken();
      if (newStatus === "completed") {
        await completeTask(task.id, { csrfToken });
      } else {
        await reopenTask(task.id, { csrfToken });
      }

      if (statusFilter !== "all") {
        await loadTasks();
      }
    } catch (err) {
      setTasks(previousTasks);
      setOperationError(
        `Failed to update task status: ${err?.message || "Server error"}`
      );
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (task) => {
    setEditingTask(task);
    setEditTitle(task.title || "");
    setEditDetails(task.details || "");
    setEditPriority(task.priority || "none");
    setEditDueDate(task.dueDate || "");
    setEditStatus(task.status || "pending");
    setEditError(null);
  };

  // Close Edit Modal
  const handleCloseEdit = () => {
    if (isSubmittingEdit) return;
    setEditingTask(null);
    setEditError(null);
  };

  // Submit Edit
  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    if (!editingTask) return;

    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      setEditError("Task title cannot be empty.");
      return;
    }
    if (trimmedTitle.length > TASK_LIMITS.MAX_TITLE_LENGTH) {
      setEditError(
        `Task title cannot exceed ${TASK_LIMITS.MAX_TITLE_LENGTH} characters.`
      );
      return;
    }
    if (editDetails && editDetails.length > TASK_LIMITS.MAX_DETAILS_LENGTH) {
      setEditError(
        `Task details cannot exceed ${TASK_LIMITS.MAX_DETAILS_LENGTH} characters.`
      );
      return;
    }

    setIsSubmittingEdit(true);
    setEditError(null);
    setOperationError(null);

    try {
      const csrfToken = await getCsrfToken();
      const updated = await updateTask(editingTask.id, {
        title: trimmedTitle,
        details: editDetails.trim() || null,
        priority: editPriority,
        dueDate: editDueDate || null,
        status: editStatus,
        csrfToken,
      });

      setTasks((prev) =>
        prev.map((t) => (t.id === editingTask.id ? { ...t, ...updated } : t))
      );
      handleCloseEdit();
      if (statusFilter !== "all" && editStatus !== editingTask.status) {
        await loadTasks();
      }
    } catch (err) {
      setEditError(err?.message || "Failed to update task.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Open Delete Confirmation Modal
  const handleOpenDelete = (task) => {
    setDeletingTask(task);
    setDeleteError(null);
  };

  // Close Delete Confirmation Modal
  const handleCloseDelete = () => {
    if (isSubmittingDelete) return;
    setDeletingTask(null);
    setDeleteError(null);
  };

  // Submit Delete (Soft Delete)
  const handleSubmitDelete = async () => {
    if (!deletingTask) return;

    setIsSubmittingDelete(true);
    setDeleteError(null);
    setOperationError(null);

    try {
      const csrfToken = await getCsrfToken();
      await deleteTask(deletingTask.id, { csrfToken });

      setTasks((prev) => prev.filter((t) => t.id !== deletingTask.id));
      setTotal((prev) => Math.max(0, prev - 1));
      handleCloseDelete();

      if (tasks.length <= 1 && offset > 0) {
        setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
      }
    } catch (err) {
      setDeleteError(err?.message || "Failed to delete task.");
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  // Counters for active view
  const pendingCount = useMemo(
    () => tasks.filter((t) => t.status === "pending").length,
    [tasks]
  );
  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === "completed").length,
    [tasks]
  );

  const todayStr = getTodayString();

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Status counters and summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/90 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF3FF] px-2.5 py-0.5 text-xs font-semibold text-[#2948D8] border border-[#C7D7FE]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#365CF5]" aria-hidden="true" />
            Total: {total}
          </span>
          {statusFilter === "all" && (
            <>
              <span className="inline-flex items-center rounded-full bg-[#F4F6FB] border border-[#E6EAF2] px-2 py-0.5 text-xs font-medium text-[#374151]">
                Pending: {pendingCount}
              </span>
              <span className="inline-flex items-center rounded-full bg-[#F4F6FB] border border-[#E6EAF2] px-2 py-0.5 text-xs font-medium text-[#374151]">
                Completed: {completedCount}
              </span>
            </>
          )}
        </div>
        <p className="text-xs text-[#667085]">Manage daily tasks and to-dos here.</p>
      </div>

      {/* Global Operation Error Alert */}
      {operationError && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs sm:text-sm text-rose-800 flex items-start justify-between"
        >
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-rose-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <span>{operationError}</span>
          </div>
          <button
            type="button"
            onClick={() => setOperationError(null)}
            className="text-rose-600 hover:text-rose-800 font-medium text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Quick-Add Task Box */}
      <div className="rounded-2xl border border-[#E6EAF2] bg-white p-3.5 sm:p-4 shadow-xs">
        <form onSubmit={handleQuickAdd} className="space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={quickTitle}
                onChange={(e) => {
                  setQuickTitle(e.target.value);
                  if (quickAddError) setQuickAddError(null);
                }}
                maxLength={TASK_LIMITS.MAX_TITLE_LENGTH}
                placeholder="What needs to be done? (e.g. Implement binary search)"
                aria-label="New task title"
                className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3.5 py-2 text-xs sm:text-sm text-[#111827] placeholder-[#8A94A6] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
                disabled={isSubmittingQuick}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Priority Picker */}
              <select
                value={quickPriority}
                onChange={(e) => setQuickPriority(e.target.value)}
                aria-label="New task priority"
                className="rounded-xl border border-[#DCE3EF] bg-white px-2.5 py-2 text-xs font-medium text-[#374151] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
                disabled={isSubmittingQuick}
              >
                <option value="none">Priority: None</option>
                <option value="low">Priority: Low</option>
                <option value="medium">Priority: Medium</option>
                <option value="high">Priority: High</option>
              </select>

              {/* Due Date Picker */}
              <input
                type="date"
                value={quickDueDate}
                onChange={(e) => setQuickDueDate(e.target.value)}
                aria-label="New task due date"
                className="rounded-xl border border-[#DCE3EF] bg-white px-2.5 py-2 text-xs text-[#374151] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
                disabled={isSubmittingQuick}
              />

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmittingQuick || !quickTitle.trim()}
                className="inline-flex items-center justify-center rounded-xl bg-[#365CF5] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#2848D8] focus-visible:outline-2 focus-visible:outline-[#A5B4FC] disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
              >
                {isSubmittingQuick ? "Adding..." : "Add Task"}
              </button>
            </div>
          </div>

          {quickAddError && (
            <p className="text-xs text-rose-600 font-medium" role="alert">
              {quickAddError}
            </p>
          )}
        </form>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/80 self-start">
          <button
            type="button"
            onClick={() => handleStatusFilterChange("all")}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              statusFilter === "all"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => handleStatusFilterChange("pending")}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              statusFilter === "pending"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Pending
          </button>
          <button
            type="button"
            onClick={() => handleStatusFilterChange("completed")}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              statusFilter === "completed"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Completed
          </button>
        </div>

        {/* Priority Filter and Search Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            value={priorityFilter}
            onChange={(e) => handlePriorityFilterChange(e.target.value)}
            aria-label="Filter tasks by priority"
            className="rounded-xl border border-[#DCE3EF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#374151] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
            <option value="none">No Priority</option>
          </select>

          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              aria-label="Search tasks"
              className="w-full sm:w-52 rounded-xl border border-[#DCE3EF] bg-white pl-8 pr-3 py-1.5 text-xs text-[#111827] placeholder-[#8A94A6] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
            />
            <svg
              className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#8A94A6]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1.5 text-[#8A94A6] hover:text-[#111827]"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 text-[#8A94A6]">
          <svg className="h-8 w-8 animate-spin text-[#365CF5] mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm font-medium">Loading tasks...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm text-rose-800 font-medium mb-3">{error}</p>
          <button
            type="button"
            onClick={() => loadTasks()}
            className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : tasks.length === 0 ? (
        debouncedQuery ? (
          <EmptyState
            title={`No tasks matching ‘${debouncedQuery}’`}
            description="Try modifying your search keywords or clearing active filters."
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        ) : statusFilter === "pending" ? (
          <EmptyState
            title="No pending tasks"
            description="You have completed all pending tasks or haven't created any yet."
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        ) : statusFilter === "completed" ? (
          <EmptyState
            title="No completed tasks"
            description="Complete some tasks to see your accomplished items here."
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
          />
        ) : (
          <EmptyState
            title="No tasks created"
            description="Manage daily tasks and to-dos here. Quick-add a task above to get started."
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
          />
        )
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => {
            const isCompleted = task.status === "completed";
            const isOverdue =
              task.status === "pending" &&
              task.dueDate &&
              task.dueDate < todayStr;
            const isDueToday =
              task.status === "pending" &&
              task.dueDate &&
              task.dueDate === todayStr;

            return (
              <div
                key={task.id}
                className={`group flex items-start gap-3 rounded-xl border p-3 sm:p-3.5 transition-colors ${
                  isCompleted
                    ? "border-slate-200/90 bg-slate-50/70 text-slate-500"
                    : "border-slate-200/90 bg-white text-slate-900 hover:border-slate-300 shadow-2xs"
                }`}
              >
                {/* Complete/Reopen Checkbox Button */}
                <button
                  type="button"
                  onClick={() => handleToggleTaskStatus(task)}
                  aria-label={
                    isCompleted
                      ? `Mark "${task.title}" as pending`
                      : `Mark "${task.title}" as completed`
                  }
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    isCompleted
                      ? "border-[#365CF5] bg-[#365CF5] text-white"
                      : "border-[#DCE3EF] bg-white hover:border-[#365CF5]"
                  }`}
                >
                  {isCompleted && (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>

                {/* Task Details Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm font-medium leading-snug break-words ${
                        isCompleted ? "line-through text-slate-400" : "text-slate-900"
                      }`}
                    >
                      {task.title}
                    </p>

                    {/* Action buttons (Edit & Delete) */}
                    <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(task)}
                        aria-label={`Edit task "${task.title}"`}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDelete(task)}
                        aria-label={`Delete task "${task.title}"`}
                        className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Task details text if present */}
                  {task.details && (
                    <p
                      className={`mt-1 text-xs whitespace-pre-wrap break-words leading-relaxed ${
                        isCompleted ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      {task.details}
                    </p>
                  )}

                  {/* Badges: Priority, Due Date, Overdue Indicator */}
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    {/* Priority badge */}
                    {task.priority === "high" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-2xs font-semibold text-rose-700 border border-rose-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-600" aria-hidden="true" />
                        High
                      </span>
                    )}
                    {task.priority === "medium" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-2xs font-semibold text-amber-700 border border-amber-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden="true" />
                        Medium
                      </span>
                    )}
                    {task.priority === "low" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-2xs font-semibold text-sky-700 border border-sky-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-600" aria-hidden="true" />
                        Low
                      </span>
                    )}

                    {/* Due Date badge */}
                    {task.dueDate && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-2xs font-medium border ${
                          isOverdue
                            ? "bg-rose-50 text-rose-700 border-rose-300 font-semibold"
                            : isDueToday
                            ? "bg-amber-50 text-amber-800 border-amber-300 font-semibold"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        {formatDisplayDate(task.dueDate)}
                        {isOverdue && " (Overdue)"}
                        {isDueToday && " (Today)"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500">
          <div>
            Showing <span className="font-medium text-slate-900">{offset + 1}</span> to{" "}
            <span className="font-medium text-slate-900">
              {Math.min(offset + PAGE_SIZE, total)}
            </span>{" "}
            of <span className="font-medium text-slate-900">{total}</span> tasks
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={offset === 0 || isLoading}
              onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!hasMore || offset + PAGE_SIZE >= total || isLoading}
              onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-task-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 id="edit-task-modal-title" className="text-lg font-bold text-slate-900">
                Edit Task
              </h2>
              <button
                type="button"
                onClick={handleCloseEdit}
                disabled={isSubmittingEdit}
                aria-label="Close edit modal"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmitEdit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="edit-task-title" className="block text-xs font-semibold text-slate-700 mb-1">
                  Title <span className="text-rose-600">*</span>
                </label>
                <input
                  id="edit-task-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={TASK_LIMITS.MAX_TITLE_LENGTH}
                  className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-sm text-[#111827] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
                  disabled={isSubmittingEdit}
                  required
                />
                <p className="mt-1 text-right text-2xs text-[#8A94A6]">
                  {editTitle.length}/{TASK_LIMITS.MAX_TITLE_LENGTH}
                </p>
              </div>

              <div>
                <label htmlFor="edit-task-details" className="block text-xs font-semibold text-[#111827] mb-1">
                  Details (Optional)
                </label>
                <textarea
                  id="edit-task-details"
                  value={editDetails}
                  onChange={(e) => setEditDetails(e.target.value)}
                  maxLength={TASK_LIMITS.MAX_DETAILS_LENGTH}
                  rows={3}
                  className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-sm text-[#111827] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
                  disabled={isSubmittingEdit}
                />
                <p className="mt-1 text-right text-2xs text-[#8A94A6]">
                  {editDetails.length}/{TASK_LIMITS.MAX_DETAILS_LENGTH}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="edit-task-priority" className="block text-xs font-semibold text-[#111827] mb-1">
                    Priority
                  </label>
                  <select
                    id="edit-task-priority"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-xs font-medium text-[#374151] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
                    disabled={isSubmittingEdit}
                  >
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-task-status" className="block text-xs font-semibold text-[#111827] mb-1">
                    Status
                  </label>
                  <select
                    id="edit-task-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-xs font-medium text-[#374151] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
                    disabled={isSubmittingEdit}
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-task-due-date" className="block text-xs font-semibold text-[#111827] mb-1">
                    Due Date
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      id="edit-task-due-date"
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full rounded-xl border border-[#DCE3EF] bg-white px-2 py-1.5 text-xs text-[#374151] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
                      disabled={isSubmittingEdit}
                    />
                    {editDueDate && (
                      <button
                        type="button"
                        onClick={() => setEditDueDate("")}
                        title="Clear due date"
                        aria-label="Clear due date"
                        className="p-1 text-[#8A94A6] hover:text-[#111827] text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {editError && (
                <div role="alert" className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                  {editError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E6EAF2]">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  disabled={isSubmittingEdit}
                  className="rounded-xl border border-[#DCE3EF] px-4 py-2 text-xs font-semibold text-[#374151] hover:bg-[#F4F6FB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="rounded-xl bg-[#365CF5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2848D8] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isSubmittingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTask && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-task-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h2 id="delete-task-modal-title" className="text-lg font-bold text-slate-900">
              Delete Task
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete <span className="font-semibold text-slate-900">“{deletingTask.title}”</span>?
            </p>
            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
              This task will be moved to a deleted state and excluded from your active tasks list.
            </div>

            {deleteError && (
              <div role="alert" className="mt-3 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                {deleteError}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseDelete}
                disabled={isSubmittingDelete}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitDelete}
                disabled={isSubmittingDelete}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {isSubmittingDelete ? "Deleting..." : "Delete Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
