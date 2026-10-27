import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RevisionPage from "../pages/RevisionPage.jsx";
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

const SAMPLE_REVISION_ITEMS = [
  {
    id: "r0000000-0001-4000-8000-000000000001",
    user_id: "user-123",
    title: "Binary Search Tree rotations",
    details: "Left and right rotations during AVL tree rebalancing.",
    subject: "DSA",
    status: "pending",
    revised_at: null,
    created_at: "2026-10-27T10:00:00.000Z",
    updated_at: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "r0000000-0002-4000-8000-000000000002",
    user_id: "user-123",
    title: "SQL Indexing B-Trees",
    details: "Clustered vs non-clustered index behavior.",
    subject: "Database",
    status: "revised",
    revised_at: "2026-10-27T12:00:00.000Z",
    created_at: "2026-10-27T08:00:00.000Z",
    updated_at: "2026-10-27T12:00:00.000Z",
  },
];

const SAMPLE_DOUBTS = [
  {
    id: "d0000000-0001-4000-8000-000000000001",
    user_id: "user-123",
    question: "Why does Java HashMap use treeify threshold of 8?",
    details: "Based on Poisson distribution of hash collisions.",
    subject: "Java",
    status: "open",
    resolution: null,
    resolved_at: null,
    created_at: "2026-10-27T09:00:00.000Z",
    updated_at: "2026-10-27T09:00:00.000Z",
  },
  {
    id: "d0000000-0002-4000-8000-000000000002",
    user_id: "user-123",
    question: "Difference between process and thread context switching?",
    details: "Thread shares virtual memory space, so TLB flush is not needed.",
    subject: "OS",
    status: "resolved",
    resolution: "Thread context switch doesn't change page tables or flush TLB, making it much faster.",
    resolved_at: "2026-10-27T11:00:00.000Z",
    created_at: "2026-10-27T07:00:00.000Z",
    updated_at: "2026-10-27T11:00:00.000Z",
  },
];

function renderRevisionPage({ initialEntries = ["/revision"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/revision"
          element={
            <ProtectedRoute>
              <RevisionPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page Mock</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Revision & Doubt Tracking Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;

    vi.spyOn(notesService, "fetchRevisionItems").mockResolvedValue({
      revision_items: [...SAMPLE_REVISION_ITEMS],
      items: [...SAMPLE_REVISION_ITEMS],
      total: SAMPLE_REVISION_ITEMS.length,
      limit: 20,
      offset: 0,
      has_more: false,
    });

    vi.spyOn(notesService, "fetchDoubts").mockResolvedValue({
      doubts: [...SAMPLE_DOUBTS],
      items: [...SAMPLE_DOUBTS],
      total: SAMPLE_DOUBTS.length,
      limit: 20,
      offset: 0,
      has_more: false,
    });

    vi.spyOn(notesService, "createRevisionItem").mockResolvedValue({
      id: "r-new-123",
      title: "New Topic",
      subject: "Math",
      status: "pending",
    });

    vi.spyOn(notesService, "updateRevisionItem").mockResolvedValue({
      ...SAMPLE_REVISION_ITEMS[0],
      title: "Updated Topic",
    });

    vi.spyOn(notesService, "markRevisionItemRevised").mockResolvedValue({
      ...SAMPLE_REVISION_ITEMS[0],
      status: "revised",
      revised_at: "2026-10-27T13:00:00.000Z",
    });

    vi.spyOn(notesService, "reopenRevisionItem").mockResolvedValue({
      ...SAMPLE_REVISION_ITEMS[1],
      status: "pending",
      revised_at: null,
    });

    vi.spyOn(notesService, "deleteRevisionItem").mockResolvedValue({ success: true });

    vi.spyOn(notesService, "createDoubt").mockResolvedValue({
      id: "d-new-123",
      question: "New Doubt?",
      subject: "Networks",
      status: "open",
    });

    vi.spyOn(notesService, "updateDoubt").mockResolvedValue({
      ...SAMPLE_DOUBTS[0],
      question: "Updated Question?",
    });

    vi.spyOn(notesService, "resolveDoubt").mockResolvedValue({
      ...SAMPLE_DOUBTS[0],
      status: "resolved",
      resolution: "Answered clearly",
      resolved_at: "2026-10-27T13:00:00.000Z",
    });

    vi.spyOn(notesService, "reopenDoubt").mockResolvedValue({
      ...SAMPLE_DOUBTS[1],
      status: "open",
      resolved_at: null,
    });

    vi.spyOn(notesService, "deleteDoubt").mockResolvedValue({ success: true });
  });

  // 1. Protected Route
  it("redirects unauthenticated users to /login", async () => {
    mockIsAuthenticated = false;
    renderRevisionPage();

    await waitFor(() => {
      expect(screen.getByText("Login Page Mock")).toBeInTheDocument();
    });
  });

  // 2. Initial Render & Tabs
  it("renders both tabs with layout description and revision items list", async () => {
    renderRevisionPage();

    // Required subtitle for layout checks
    expect(
      screen.getByText("Track spaced repetition and revision schedules.")
    ).toBeInTheDocument();

    // Tab buttons
    expect(screen.getByRole("tab", { name: /Revision Items/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Doubts & Questions/i })).toBeInTheDocument();

    // Revision items rendered
    await waitFor(() => {
      expect(screen.getByText("Binary Search Tree rotations")).toBeInTheDocument();
      expect(screen.getByText("SQL Indexing B-Trees")).toBeInTheDocument();
    });

    // Subject badges
    expect(screen.getByText("DSA")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();

    // Status badges
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Revised").length).toBeGreaterThan(0);
  });

  // 3. Quick-Add Revision Topic
  it("quick-adds a revision topic successfully", async () => {
    const user = userEvent.setup();
    renderRevisionPage();

    await waitFor(() => {
      expect(screen.getByText("Binary Search Tree rotations")).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText(/Quick add topic to revise/i);
    const subjectInput = screen.getByPlaceholderText("Subject (e.g. DSA)");
    const submitBtn = screen.getByRole("button", { name: "Add Topic" });

    await user.type(titleInput, "Graph Dijkstra Edge Cases");
    await user.type(subjectInput, "Algorithms");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(notesService.createRevisionItem).toHaveBeenCalledWith(
        {
          title: "Graph Dijkstra Edge Cases",
          subject: "Algorithms",
        },
        "test-csrf-token"
      );
    });
  });

  // 4. Mark Revised and Reopen Revision Item with Optimistic UI
  it("toggles revision item status between revised and pending", async () => {
    const user = userEvent.setup();
    renderRevisionPage();

    await waitFor(() => {
      expect(screen.getByText("Binary Search Tree rotations")).toBeInTheDocument();
    });

    // Find the Mark Revised button for the first pending item
    const markRevisedBtn = screen.getByRole("button", { name: "Mark Revised" });
    await user.click(markRevisedBtn);

    await waitFor(() => {
      expect(notesService.markRevisionItemRevised).toHaveBeenCalledWith(
        SAMPLE_REVISION_ITEMS[0].id,
        "test-csrf-token"
      );
    });

    // Find Reopen button for the second item
    const reopenBtns = screen.getAllByRole("button", { name: "Reopen" });
    await user.click(reopenBtns[reopenBtns.length - 1]);

    await waitFor(() => {
      expect(notesService.reopenRevisionItem).toHaveBeenCalledWith(
        SAMPLE_REVISION_ITEMS[1].id,
        "test-csrf-token"
      );
    });
  });

  // 5. Rollback on Failure
  it("rolls back optimistic update when status toggle fails", async () => {
    const user = userEvent.setup();
    notesService.markRevisionItemRevised.mockRejectedValueOnce(
      new Error("Network connection error")
    );

    renderRevisionPage();

    await waitFor(() => {
      expect(screen.getByText("Binary Search Tree rotations")).toBeInTheDocument();
    });

    const markRevisedBtn = screen.getByRole("button", { name: "Mark Revised" });
    await user.click(markRevisedBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network connection error");
    });
  });

  // 6. Create & Edit Revision Modal
  it("creates revision item via modal", async () => {
    const user = userEvent.setup();
    renderRevisionPage();

    const newBtn = screen.getByRole("button", { name: /New Revision Topic/i });
    await user.click(newBtn);

    expect(screen.getByRole("heading", { name: "New Revision Topic" })).toBeInTheDocument();

    const modal = screen.getByRole("dialog");
    const titleInput = within(modal).getByLabelText(/Topic Title \*/i);
    const subjectInput = within(modal).getByLabelText(/Subject \(Optional\)/i);
    const detailsInput = within(modal).getByLabelText(/Details & Key Concepts \(Optional\)/i);

    await user.type(titleInput, "Dynamic Programming Master Theorem");
    await user.type(subjectInput, "Algorithms");
    await user.type(detailsInput, "Divide and conquer recurrence relations.");

    const createBtn = within(modal).getByRole("button", { name: "Create Topic" });
    await user.click(createBtn);

    await waitFor(() => {
      expect(notesService.createRevisionItem).toHaveBeenCalledWith(
        {
          title: "Dynamic Programming Master Theorem",
          subject: "Algorithms",
          details: "Divide and conquer recurrence relations.",
        },
        "test-csrf-token"
      );
    });
  });

  // 7. Delete Revision Item Modal
  it("deletes revision item after confirmation modal", async () => {
    const user = userEvent.setup();
    renderRevisionPage();

    await waitFor(() => {
      expect(screen.getByText("Binary Search Tree rotations")).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByLabelText("Delete topic");
    await user.click(deleteBtns[0]);

    expect(screen.getByText("Delete Revision Topic?")).toBeInTheDocument();

    const confirmDeleteBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(notesService.deleteRevisionItem).toHaveBeenCalledWith(
        SAMPLE_REVISION_ITEMS[0].id,
        "test-csrf-token"
      );
    });
  });

  // 8. Doubts Tab Switching and Listing
  it("switches to doubts tab and renders doubts list with resolution", async () => {
    const user = userEvent.setup();
    renderRevisionPage();

    const doubtsTab = screen.getByRole("tab", { name: /Doubts & Questions/i });
    await user.click(doubtsTab);

    await waitFor(() => {
      expect(
        screen.getByText("Why does Java HashMap use treeify threshold of 8?")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Difference between process and thread context switching?")
      ).toBeInTheDocument();
    });

    // Resolution callout visible for resolved doubt
    expect(screen.getByText(/Thread context switch doesn't change page tables/i)).toBeInTheDocument();
    expect(screen.getAllByText("Resolved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
  });

  // 9. Quick-Add Doubt
  it("quick-adds a doubt successfully", async () => {
    const user = userEvent.setup();
    renderRevisionPage();

    const doubtsTab = screen.getByRole("tab", { name: /Doubts & Questions/i });
    await user.click(doubtsTab);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask or record a doubt/i)).toBeInTheDocument();
    });

    const questionInput = screen.getByPlaceholderText(/Ask or record a doubt/i);
    const subjectInput = screen.getByPlaceholderText("Subject (e.g. Java)");
    const submitBtn = screen.getByRole("button", { name: "Ask Doubt" });

    await user.type(questionInput, "What is false sharing in CPU caches?");
    await user.type(subjectInput, "Architecture");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(notesService.createDoubt).toHaveBeenCalledWith(
        {
          question: "What is false sharing in CPU caches?",
          subject: "Architecture",
        },
        "test-csrf-token"
      );
    });
  });

  // 10. Resolve Doubt with Resolution Notes Modal
  it("resolves an open doubt with optional resolution notes", async () => {
    const user = userEvent.setup();
    renderRevisionPage();

    const doubtsTab = screen.getByRole("tab", { name: /Doubts & Questions/i });
    await user.click(doubtsTab);

    await waitFor(() => {
      expect(screen.getByText("Resolve Doubt")).toBeInTheDocument();
    });

    const resolveBtn = screen.getByRole("button", { name: "Resolve Doubt" });
    await user.click(resolveBtn);

    expect(screen.getByText("Mark Doubt as Resolved")).toBeInTheDocument();

    const resolutionTextarea = screen.getByLabelText(/Resolution \/ Explanation \(Optional\)/i);
    await user.type(resolutionTextarea, "Because with well distributed hash codes, 8 collisions is extremely rare (< 1 in 10 million).");

    const confirmBtn = screen.getByRole("button", { name: "Confirm Resolved" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(notesService.resolveDoubt).toHaveBeenCalledWith(
        SAMPLE_DOUBTS[0].id,
        { resolution: "Because with well distributed hash codes, 8 collisions is extremely rare (< 1 in 10 million)." },
        "test-csrf-token"
      );
    });
  });

  // 11. Reopen Doubt
  it("reopens a resolved doubt", async () => {
    const user = userEvent.setup();
    renderRevisionPage();

    const doubtsTab = screen.getByRole("tab", { name: /Doubts & Questions/i });
    await user.click(doubtsTab);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    });

    const reopenBtn = screen.getByRole("button", { name: "Reopen" });
    await user.click(reopenBtn);

    await waitFor(() => {
      expect(notesService.reopenDoubt).toHaveBeenCalledWith(
        SAMPLE_DOUBTS[1].id,
        "test-csrf-token"
      );
    });
  });

  // 12. Delete Doubt Modal
  it("deletes a doubt after confirmation modal", async () => {
    const user = userEvent.setup();
    renderRevisionPage();

    const doubtsTab = screen.getByRole("tab", { name: /Doubts & Questions/i });
    await user.click(doubtsTab);

    await waitFor(() => {
      expect(screen.getAllByLabelText("Delete doubt").length).toBeGreaterThan(0);
    });

    const deleteBtns = screen.getAllByLabelText("Delete doubt");
    await user.click(deleteBtns[0]);

    expect(screen.getByText("Delete Doubt?")).toBeInTheDocument();

    const confirmDeleteBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(notesService.deleteDoubt).toHaveBeenCalledWith(
        SAMPLE_DOUBTS[0].id,
        "test-csrf-token"
      );
    });
  });

  // 13. Empty State Render
  it("renders empty state when no revision topics exist", async () => {
    notesService.fetchRevisionItems.mockResolvedValueOnce({
      revision_items: [],
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      has_more: false,
    });

    renderRevisionPage();

    await waitFor(() => {
      expect(screen.getByText("No revision topics yet")).toBeInTheDocument();
    });
  });
});
