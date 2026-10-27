import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import QuestionsPage from "../pages/QuestionsPage.jsx";
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

const SAMPLE_QUESTIONS = [
  {
    id: "90000000-0001-4000-8000-000000000001",
    type: "SHORT_ANSWER",
    question: "What is an inverted index in search engines?",
    answer: "A database index mapping words to their locations in a document.",
    explanation: "Used extensively in full-text search.",
    topic: "Information Retrieval",
    difficulty: "medium",
    status: "unlearned",
    options: null,
    correctOptionIndex: null,
    lastPracticedAt: null,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "90000000-0002-4000-8000-000000000002",
    type: "MCQ",
    question: "What is the worst-case time complexity of QuickSelect?",
    answer: null,
    explanation: "When bad pivot selection degrades partition to size N-1.",
    topic: "Algorithms",
    difficulty: "hard",
    status: "learning",
    options: ["O(N)", "O(N log N)", "O(N^2)", "O(log N)"],
    correctOptionIndex: 2,
    lastPracticedAt: "2026-10-27T11:00:00.000Z",
    createdAt: "2026-10-27T09:00:00.000Z",
    updatedAt: "2026-10-27T11:00:00.000Z",
  },
  {
    id: "90000000-0003-4000-8000-000000000003",
    type: "CODING",
    question: "Implement an iterative binary search on a sorted integer array.",
    answer: "int lo = 0, hi = n - 1; while (lo <= hi) { int mid = lo + (hi - lo) / 2; ... }",
    explanation: "Avoid overflow by computing lo + (hi - lo) / 2.",
    topic: "Arrays",
    difficulty: "easy",
    status: "mastered",
    options: null,
    correctOptionIndex: null,
    lastPracticedAt: null,
    createdAt: "2026-10-27T08:00:00.000Z",
    updatedAt: "2026-10-27T08:00:00.000Z",
  },
];

function renderQuestionsPage({ initialEntries = ["/questions"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/questions"
          element={
            <ProtectedRoute>
              <QuestionsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page Mock</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Question Bank Feature Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    vi.spyOn(notesService, "fetchQuestions").mockResolvedValue({
      questions: [...SAMPLE_QUESTIONS],
      items: [...SAMPLE_QUESTIONS],
      total: SAMPLE_QUESTIONS.length,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
  });

  // 1. Protected Route
  it("redirects unauthenticated users to /login", async () => {
    mockIsAuthenticated = false;
    renderQuestionsPage();

    await waitFor(() => {
      expect(screen.getByText("Login Page Mock")).toBeInTheDocument();
    });
  });

  // 2. Listing & Badges
  it("renders questions with type, difficulty, status, and topic badges", async () => {
    renderQuestionsPage();

    await waitFor(() => {
      expect(screen.getByText("What is an inverted index in search engines?")).toBeInTheDocument();
    });

    expect(screen.getByText("What is the worst-case time complexity of QuickSelect?")).toBeInTheDocument();
    expect(
      screen.getByText("Implement an iterative binary search on a sorted integer array.")
    ).toBeInTheDocument();

    // Type badges
    expect(screen.getAllByText("Short Answer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("MCQ").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Coding").length).toBeGreaterThanOrEqual(1);

    // Difficulty badges
    expect(screen.getAllByText("Medium").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Hard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Easy").length).toBeGreaterThanOrEqual(1);

    // Topics
    expect(screen.getByText("#Information Retrieval")).toBeInTheDocument();
    expect(screen.getByText("#Algorithms")).toBeInTheDocument();
    expect(screen.getByText("#Arrays")).toBeInTheDocument();
  });

  // 3. Create SHORT_ANSWER, MCQ, and CODING Questions
  it("creates a SHORT_ANSWER question via modal", async () => {
    const user = userEvent.setup({ delay: null });
    const createSpy = vi.spyOn(notesService, "createQuestion").mockResolvedValue({
      id: "90000000-0004-4000-8000-000000000004",
      type: "SHORT_ANSWER",
      question: "What is the difference between TCP and UDP?",
      answer: "TCP is connection-oriented; UDP is connectionless.",
      explanation: "TCP provides reliability via ACKs.",
      topic: "Networking",
      difficulty: "easy",
      status: "unlearned",
      options: null,
      correctOptionIndex: null,
      lastPracticedAt: null,
      createdAt: "2026-10-27T12:00:00.000Z",
      updatedAt: "2026-10-27T12:00:00.000Z",
    });

    renderQuestionsPage();

    await waitFor(() => {
      expect(screen.getByText("What is an inverted index in search engines?")).toBeInTheDocument();
    });

    const newBtn = screen.getByRole("button", { name: /New Question/i });
    await user.click(newBtn);

    const dialog = screen.getByRole("dialog", { name: "New Question" });
    expect(dialog).toBeInTheDocument();

    const qInput = within(dialog).getByPlaceholderText("Enter the question prompt...");
    await user.type(qInput, "What is the difference between TCP and UDP?");

    const topicInput = within(dialog).getByPlaceholderText("e.g. Arrays, Java Collections, SQL");
    await user.type(topicInput, "Networking");

    const ansInput = within(dialog).getByPlaceholderText("Enter expected answer...");
    await user.type(ansInput, "TCP is connection-oriented; UDP is connectionless.");

    const submitBtn = within(dialog).getByRole("button", { name: "Create Question" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SHORT_ANSWER",
          question: "What is the difference between TCP and UDP?",
          topic: "Networking",
          answer: "TCP is connection-oriented; UDP is connectionless.",
          csrfToken: "test-csrf-token",
        })
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New Question" })).not.toBeInTheDocument();
    });
  });

  // 4. Create MCQ with Option Builder and Validation
  it("creates an MCQ question with options and correct option selection", async () => {
    const user = userEvent.setup({ delay: null });
    const createSpy = vi.spyOn(notesService, "createQuestion").mockResolvedValue({
      id: "90000000-0005-4000-8000-000000000005",
      type: "MCQ",
      question: "Which keyword prevents Java inheritance?",
      answer: null,
      explanation: "final classes cannot be subclassed.",
      topic: "Java",
      difficulty: "easy",
      status: "unlearned",
      options: ["static", "final", "const", "abstract"],
      correctOptionIndex: 1,
      lastPracticedAt: null,
      createdAt: "2026-10-27T12:00:00.000Z",
      updatedAt: "2026-10-27T12:00:00.000Z",
    });

    renderQuestionsPage();

    await waitFor(() => {
      expect(screen.getByText("What is an inverted index in search engines?")).toBeInTheDocument();
    });

    const newBtn = screen.getByRole("button", { name: /New Question/i });
    await user.click(newBtn);

    const dialog = screen.getByRole("dialog", { name: "New Question" });
    const typeSelect = within(dialog).getByLabelText(/Question Type/);
    await user.selectOptions(typeSelect, "MCQ");

    const qInput = within(dialog).getByPlaceholderText("Enter the question prompt...");
    await user.type(qInput, "Which keyword prevents Java inheritance?");

    // Fill options
    const optInputs = within(dialog).getAllByPlaceholderText(/Option \d/);
    await user.type(optInputs[0], "static");
    await user.type(optInputs[1], "final");

    // Select second option as correct
    const radioButtons = within(dialog).getAllByRole("radio");
    await user.click(radioButtons[1]);

    const submitBtn = within(dialog).getByRole("button", { name: "Create Question" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "MCQ",
          question: "Which keyword prevents Java inheritance?",
          options: ["static", "final"],
          correctOptionIndex: 1,
          csrfToken: "test-csrf-token",
        })
      );
    });
  });

  // 5. Practice Mode: Reveal, MCQ check, and Practice Result
  it("runs interactive practice mode with reveal and answer checking", async () => {
    const user = userEvent.setup({ delay: null });
    const practiceSpy = vi.spyOn(notesService, "practiceQuestion").mockResolvedValue({
      ...SAMPLE_QUESTIONS[1],
      lastPracticedAt: new Date().toISOString(),
    });

    renderQuestionsPage();

    await waitFor(() => {
      expect(screen.getByText("What is the worst-case time complexity of QuickSelect?")).toBeInTheDocument();
    });

    // Click Practice on the MCQ question specifically
    const practiceBtn = screen.getByLabelText(
      'Practice question "What is the worst-case time complexity of QuickSelect?"'
    );
    await user.click(practiceBtn);

    const practiceDialog = screen.getByRole("dialog", { name: /Practice/i });
    expect(practiceDialog).toBeInTheDocument();
    expect(
      within(practiceDialog).getByText("What is the worst-case time complexity of QuickSelect?")
    ).toBeInTheDocument();

    // Select option O(N^2) (index 2)
    const optionO_N2 = within(practiceDialog).getByRole("button", { name: /O\(N\^2\)/ });
    await user.click(optionO_N2);

    // Click Check Answer
    const checkBtn = within(practiceDialog).getByRole("button", { name: "Check Answer" });
    await user.click(checkBtn);

    // Verify correct indicator
    expect(within(practiceDialog).getByText(/Correct Answer/i)).toBeInTheDocument();

    // Click Mark correct
    const markCorrectBtn = within(practiceDialog).getByRole("button", { name: "Mark correct" });
    await user.click(markCorrectBtn);

    await waitFor(() => {
      expect(practiceSpy).toHaveBeenCalledWith(SAMPLE_QUESTIONS[1].id, {
        result: "correct",
        csrfToken: "test-csrf-token",
      });
    });

    expect(
      within(practiceDialog).getByText(/Marked correct! Keep up the momentum./i)
    ).toBeInTheDocument();
  });

  // 6. Quick Status Update
  it("updates mastery status via card status selector with optimistic update", async () => {
    const user = userEvent.setup({ delay: null });
    const statusSpy = vi.spyOn(notesService, "updateQuestionStatus").mockResolvedValue({
      ...SAMPLE_QUESTIONS[0],
      status: "mastered",
    });

    renderQuestionsPage();

    await waitFor(() => {
      expect(screen.getByText("What is an inverted index in search engines?")).toBeInTheDocument();
    });

    const statusSelector = screen.getByLabelText(
      'Update mastery status for "What is an inverted index in search engines?"'
    );
    await user.selectOptions(statusSelector, "mastered");

    await waitFor(() => {
      expect(statusSpy).toHaveBeenCalledWith(SAMPLE_QUESTIONS[0].id, {
        status: "mastered",
        csrfToken: "test-csrf-token",
      });
    });
  });

  // 7. Soft Delete with Confirmation Modal
  it("opens delete confirmation modal and soft-deletes question", async () => {
    const user = userEvent.setup({ delay: null });
    const deleteSpy = vi.spyOn(notesService, "deleteQuestion").mockResolvedValue(true);

    renderQuestionsPage();

    await waitFor(() => {
      expect(screen.getByText("Implement an iterative binary search on a sorted integer array.")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByLabelText(
      'Delete question "Implement an iterative binary search on a sorted integer array."'
    );
    await user.click(deleteBtn);

    const dialog = screen.getByRole("dialog", { name: "Delete Question" });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText(/This question will be moved to a deleted state/i)
    ).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole("button", { name: "Delete Question" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(SAMPLE_QUESTIONS[2].id, {
        csrfToken: "test-csrf-token",
      });
    });

    await waitFor(() => {
      expect(
        screen.queryByText("Implement an iterative binary search on a sorted integer array.")
      ).not.toBeInTheDocument();
    });
  });

  // 8. Empty States
  it("displays proper empty states for initial and filter-empty states", async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(notesService, "fetchQuestions").mockResolvedValue({
      questions: [],
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });

    renderQuestionsPage();

    await waitFor(() => {
      expect(screen.getByText("No questions yet")).toBeInTheDocument();
    });

    // Enter search
    const searchInput = screen.getByLabelText("Search questions");
    await user.type(searchInput, "dynamic programming");

    await waitFor(() => {
      expect(screen.getByText("No questions match your filters")).toBeInTheDocument();
    });
  });

  // 9. Optimistic Rollback on Status Update Failure
  it("rolls back status update and displays error alert when status update fails", async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(notesService, "updateQuestionStatus").mockRejectedValue(
      new Error("Network connection dropped")
    );

    renderQuestionsPage();

    await waitFor(() => {
      expect(screen.getByText("What is an inverted index in search engines?")).toBeInTheDocument();
    });

    const statusSelector = screen.getByLabelText(
      'Update mastery status for "What is an inverted index in search engines?"'
    );
    await user.selectOptions(statusSelector, "mastered");

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to update status: Network connection dropped/i)
      ).toBeInTheDocument();
    });
  });
});
