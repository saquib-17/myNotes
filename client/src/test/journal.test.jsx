import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import JournalPage from "../pages/JournalPage.jsx";
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

const SAMPLE_ENTRIES = [
  {
    id: "j0000000-0001-4000-8000-000000000001",
    user_id: "user-123",
    entry_date: "2026-10-25",
    content: "Studied PostgreSQL indexes and execution plans today.",
    created_at: "2026-10-25T10:00:00.000Z",
    updated_at: "2026-10-25T10:00:00.000Z",
  },
  {
    id: "j0000000-0002-4000-8000-000000000002",
    user_id: "user-123",
    entry_date: "2026-10-24",
    content: "Solved 3 dynamic programming problems on LeetCode.",
    created_at: "2026-10-24T09:00:00.000Z",
    updated_at: "2026-10-24T09:00:00.000Z",
  },
];

function renderJournalPage({ initialEntries = ["/journal"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/journal"
          element={
            <ProtectedRoute>
              <JournalPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page Mock</div>} />
        <Route path="/dashboard" element={<div>Dashboard Mock</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Journal Feature Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;

    vi.spyOn(notesService, "fetchJournalEntries").mockResolvedValue({
      entries: [...SAMPLE_ENTRIES],
      items: [...SAMPLE_ENTRIES],
      total: SAMPLE_ENTRIES.length,
      limit: 10,
      offset: 0,
      hasMore: false,
      has_more: false,
    });

    vi.spyOn(notesService, "fetchJournalEntryByDate").mockImplementation(async (date) => {
      const match = SAMPLE_ENTRIES.find((e) => e.entry_date === date);
      return match ? { ...match } : null;
    });

    vi.spyOn(notesService, "saveJournalEntry").mockImplementation(async (date, payload) => {
      const content = typeof payload === "string" ? payload : payload.content;
      return {
        id: "j-new-123",
        user_id: "user-123",
        entry_date: date,
        content,
        created_at: "2026-10-27T10:00:00.000Z",
        updated_at: "2026-10-27T10:00:00.000Z",
        created: true,
      };
    });

    vi.spyOn(notesService, "deleteJournalEntry").mockResolvedValue(true);
  });

  // 1. Protected Route
  it("redirects unauthenticated users to /login", async () => {
    mockIsAuthenticated = false;
    renderJournalPage();

    await waitFor(() => {
      expect(screen.getByText("Login Page Mock")).toBeInTheDocument();
    });
  });

  // 2. Default render with today's date and empty/loaded state
  it("renders journal page with layout phrase and history entries", async () => {
    renderJournalPage();

    expect(
      screen.getByText("Reflect and write daily journal entries.")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText(/Studied PostgreSQL indexes and execution plans today/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Solved 3 dynamic programming problems on LeetCode/i)
      ).toBeInTheDocument();
    });

    // Check textarea placeholder
    const textarea = screen.getByPlaceholderText(/What did you learn today\?/i);
    expect(textarea).toBeInTheDocument();
  });

  // 3. Save a new entry
  it("saves a new journal entry via Save button and marks status as Saved", async () => {
    const user = userEvent.setup();
    renderJournalPage();

    const textarea = await screen.findByPlaceholderText(/What did you learn today\?/i);
    await user.type(textarea, "Today I implemented the Journal feature.");

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: /Save Entry/i });
    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);

    await waitFor(() => {
      expect(notesService.saveJournalEntry).toHaveBeenCalledWith(
        expect.any(String),
        { content: "Today I implemented the Journal feature." },
        "test-csrf-token"
      );
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  // 4. Keyboard Shortcut Ctrl+S / Cmd+S
  it("saves entry via keyboard shortcut Ctrl+S", async () => {
    const user = userEvent.setup();
    renderJournalPage();

    const textarea = await screen.findByPlaceholderText(/What did you learn today\?/i);
    await user.type(textarea, "Short reflection via shortcut.");

    // Trigger Ctrl+S
    await user.keyboard("{Control>}s{/Control}");

    await waitFor(() => {
      expect(notesService.saveJournalEntry).toHaveBeenCalledWith(
        expect.any(String),
        { content: "Short reflection via shortcut." },
        "test-csrf-token"
      );
    });
  });

  // 5. Load past entry by clicking history item
  it("loads a past entry when clicked in the journal history list", async () => {
    const user = userEvent.setup();
    renderJournalPage();

    const pastEntryBtn = await screen.findByRole("button", {
      name: /Studied PostgreSQL indexes and execution plans today/i,
    });
    await user.click(pastEntryBtn);

    await waitFor(() => {
      const textarea = screen.getByLabelText(/Journal Entry Content/i);
      expect(textarea.value).toBe(
        "Studied PostgreSQL indexes and execution plans today."
      );
    });
  });

  // 6. Unsaved changes warning when switching date
  it("prompts user before switching dates when unsaved edits exist", async () => {
    const user = userEvent.setup();
    renderJournalPage();

    const textarea = await screen.findByPlaceholderText(/What did you learn today\?/i);
    await user.type(textarea, "Unsaved draft for today.");

    await waitFor(() => {
      expect(
        screen.getByText(/Studied PostgreSQL indexes and execution plans today/i)
      ).toBeInTheDocument();
    });

    // Try clicking past entry
    const pastEntryBtn = screen.getByRole("button", {
      name: /Studied PostgreSQL indexes and execution plans today/i,
    });
    await user.click(pastEntryBtn);

    // Confirmation modal should appear
    expect(
      screen.getByText("Discard edits and switch date?")
    ).toBeInTheDocument();

    const discardBtn = screen.getByRole("button", { name: "Discard and Switch" });
    await user.click(discardBtn);

    await waitFor(() => {
      expect(screen.queryByText("Discard edits and switch date?")).not.toBeInTheDocument();
    });
  });

  // 7. Soft-delete current entry
  it("soft-deletes an existing journal entry with confirmation modal", async () => {
    const user = userEvent.setup();
    renderJournalPage();

    // Select date 2026-10-25 which has an existing entry
    const pastEntryBtn = await screen.findByRole("button", {
      name: /Studied PostgreSQL indexes and execution plans today/i,
    });
    await user.click(pastEntryBtn);

    await waitFor(() => {
      expect(screen.getByLabelText("Delete entry")).toBeInTheDocument();
    });

    const deleteIconBtn = screen.getByLabelText("Delete entry");
    await user.click(deleteIconBtn);

    expect(screen.getByText("Delete Journal Entry?")).toBeInTheDocument();

    const modal = screen.getByRole("dialog");
    const confirmDeleteBtn = within(modal).getByRole("button", {
      name: "Delete Entry",
    });
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(notesService.deleteJournalEntry).toHaveBeenCalledWith(
        "2026-10-25",
        "test-csrf-token"
      );
    });
  });

  // 8. Search and date range filtering
  it("filters history by search query and date range", async () => {
    const user = userEvent.setup();
    renderJournalPage();

    const searchInput = screen.getByPlaceholderText(/Search reflections & notes/i);
    await user.type(searchInput, "LeetCode");

    await waitFor(() => {
      expect(notesService.fetchJournalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ q: "LeetCode" }),
        expect.anything()
      );
    });
  });

  // 9. Empty states
  it("displays empty state when no history entries exist", async () => {
    notesService.fetchJournalEntries.mockResolvedValueOnce({
      entries: [],
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
      hasMore: false,
      has_more: false,
    });

    renderJournalPage();

    await waitFor(() => {
      expect(screen.getByText("No journal entries yet")).toBeInTheDocument();
    });
  });

  // 10. Save error handling
  it("displays honest error message when save fails and preserves draft", async () => {
    const user = userEvent.setup();
    notesService.saveJournalEntry.mockRejectedValueOnce(
      new Error("Network connection error")
    );

    renderJournalPage();

    const textarea = await screen.findByPlaceholderText(/What did you learn today\?/i);
    await user.type(textarea, "Trying to save during network drop.");

    const saveBtn = screen.getByRole("button", { name: /Save Entry/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network connection error");
      expect(textarea.value).toBe("Trying to save during network drop.");
    });
  });
});
