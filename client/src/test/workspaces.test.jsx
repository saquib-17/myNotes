import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useOutletContext } from "react-router-dom";
import AppLayout from "../layouts/AppLayout.jsx";
import WorkspacesPage from "../pages/WorkspacesPage.jsx";
import DashboardPage from "../pages/DashboardPage.jsx";
import { WorkspaceProvider } from "../context/WorkspaceContext.jsx";
import { CollectionsProvider } from "../context/CollectionsContext.jsx";
import { TagsProvider } from "../context/TagsContext.jsx";
import {
  WORKSPACE_LIMITS,
  validateClientWorkspaceName,
  getStoredActiveWorkspaceId,
  setStoredActiveWorkspaceId,
} from "../services/notes.service.js";
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

const SAMPLE_WORKSPACES = [
  {
    id: "w001-0001-4000-8000-000000000001",
    name: "Default",
    isDefault: true,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "w001-0002-4000-8000-000000000002",
    name: "Placement Prep",
    isDefault: false,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
  {
    id: "w001-0003-4000-8000-000000000003",
    name: "Projects",
    isDefault: false,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  },
];

function renderWithProviders(ui, { initialEntries = ["/dashboard"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <WorkspaceProvider>
        <CollectionsProvider>
          <TagsProvider>{ui}</TagsProvider>
        </CollectionsProvider>
      </WorkspaceProvider>
    </MemoryRouter>
  );
}

describe("Workspaces Feature Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(notesService, "fetchWorkspaces").mockResolvedValue({
      workspaces: SAMPLE_WORKSPACES,
    });
    vi.spyOn(notesService, "fetchCollections").mockResolvedValue({
      collections: [],
      total: 0,
    });
    vi.spyOn(notesService, "fetchTags").mockResolvedValue([]);
    vi.spyOn(notesService, "fetchDashboardOverview").mockResolvedValue({
      date: "2026-10-28",
      user: { name: "Test User" },
      stats: { activeNotes: 5 },
      today: { journalSaved: false, dueTasks: [], overdueTasks: [] },
      focus: { tasks: [], doubts: [], revisionItems: [] },
      recent: { notes: [], questions: [], documents: [] },
    });
  });

  describe("1. Workspace Validation & Storage Utilities", () => {
    it("validates workspace name correctly", () => {
      expect(validateClientWorkspaceName("Personal")).toBe("Personal");
      expect(validateClientWorkspaceName("   College   Notes   ")).toBe("College Notes");
      expect(() => validateClientWorkspaceName("")).toThrow("cannot be empty");
      expect(() => validateClientWorkspaceName("   ")).toThrow("cannot be empty");
      expect(() => validateClientWorkspaceName(123)).toThrow("must be a string");
      expect(() => validateClientWorkspaceName("A".repeat(61))).toThrow("cannot exceed 60");
    });

    it("persists active workspace ID in localStorage", () => {
      expect(getStoredActiveWorkspaceId()).toBeNull();
      setStoredActiveWorkspaceId("w001-0002-4000-8000-000000000002");
      expect(getStoredActiveWorkspaceId()).toBe("w001-0002-4000-8000-000000000002");
      setStoredActiveWorkspaceId(null);
      expect(getStoredActiveWorkspaceId()).toBeNull();
    });
  });

  describe("2. Workspace Switcher in App Shell", () => {
    it("renders active workspace name and Default badge", async () => {
      renderWithProviders(<AppLayout />);

      await waitFor(() => {
        expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
      });
    });

    it("opens switcher dropdown and allows switching workspaces", async () => {
      const user = userEvent.setup();
      renderWithProviders(<AppLayout />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /switch workspace/i }).length).toBeGreaterThan(0);
      });

      const switcherBtn = screen.getAllByRole("button", { name: /switch workspace/i })[0];
      await user.click(switcherBtn);

      await waitFor(() => {
        expect(screen.getByRole("listbox", { name: /workspaces/i })).toBeInTheDocument();
      });

      // Switch to 'Placement Prep'
      const placementPrepBtn = screen.getByRole("option", { name: /placement prep/i });
      await user.click(placementPrepBtn);

      await waitFor(() => {
        expect(localStorage.getItem(WORKSPACE_LIMITS.STORAGE_KEY)).toBe(
          "w001-0002-4000-8000-000000000002"
        );
      });
    });

    it("prompts confirmation when switching workspace with unsaved editor draft", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      // Render a component inside AppLayout that sets editorDirty
      function MockEditorChild() {
        const { setEditorDirty } = useOutletContext();
        useEffect(() => {
          setEditorDirty(true);
        }, [setEditorDirty]);
        return (
          <div>
            <span>Editor View</span>
          </div>
        );
      }

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <WorkspaceProvider>
            <CollectionsProvider>
              <TagsProvider>
                <Routes>
                  <Route element={<AppLayout />}>
                    <Route path="dashboard" element={<MockEditorChild />} />
                  </Route>
                </Routes>
              </TagsProvider>
            </CollectionsProvider>
          </WorkspaceProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /switch workspace/i }).length).toBeGreaterThan(0);
      });

      const switcherBtn = screen.getAllByRole("button", { name: /switch workspace/i })[0];
      await user.click(switcherBtn);

      const option = await screen.findByRole("option", { name: /placement prep/i });
      await user.click(option);

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringMatching(/unsaved changes/i)
      );
      expect(localStorage.getItem(WORKSPACE_LIMITS.STORAGE_KEY)).not.toBe(
        "w001-0002-4000-8000-000000000002"
      );
    });
  });

  describe("3. Manage Workspaces Modal", () => {
    it("opens manage workspaces modal from switcher dropdown", async () => {
      const user = userEvent.setup();
      renderWithProviders(<AppLayout />);

      const switcherBtn = screen.getAllByRole("button", { name: /switch workspace/i })[0];
      await user.click(switcherBtn);

      const manageBtn = await screen.findByRole("button", { name: /manage workspaces/i });
      await user.click(manageBtn);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Manage Workspaces" })).toBeInTheDocument();
      });

      expect(screen.getByRole("textbox", { name: /new workspace name/i })).toBeInTheDocument();
      expect(screen.getByText("Workspaces (3)")).toBeInTheDocument();
    });

    it("creates a new workspace through the modal and displays it", async () => {
      const user = userEvent.setup();
      const createSpy = vi.spyOn(notesService, "createWorkspace").mockResolvedValue({
        workspace: {
          id: "w001-0004-4000-8000-000000000004",
          name: "Interviews",
          isDefault: false,
          createdAt: "2026-10-28T00:00:00.000Z",
          updatedAt: "2026-10-28T00:00:00.000Z",
        },
      });

      renderWithProviders(<AppLayout />);

      const switcherBtn = screen.getAllByRole("button", { name: /switch workspace/i })[0];
      await user.click(switcherBtn);

      const manageBtn = await screen.findByRole("button", { name: /manage workspaces/i });
      await user.click(manageBtn);

      const input = screen.getByRole("textbox", { name: /new workspace name/i });
      await user.type(input, "Interviews");

      const addBtn = screen.getByRole("button", { name: /^add$/i });
      await user.click(addBtn);

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Interviews" })
        );
      });
    });

    it("displays error when creating duplicate workspace name (409)", async () => {
      const user = userEvent.setup();
      const err = new Error("A workspace named 'Placement Prep' already exists.");
      err.status = 409;
      vi.spyOn(notesService, "createWorkspace").mockRejectedValue(err);

      renderWithProviders(<AppLayout />);

      const switcherBtn = screen.getAllByRole("button", { name: /switch workspace/i })[0];
      await user.click(switcherBtn);

      const manageBtn = await screen.findByRole("button", { name: /manage workspaces/i });
      await user.click(manageBtn);

      const input = screen.getByRole("textbox", { name: /new workspace name/i });
      await user.type(input, "Placement Prep");

      const addBtn = screen.getByRole("button", { name: /^add$/i });
      await user.click(addBtn);

      await waitFor(() => {
        expect(screen.getByText(/already exists/i)).toBeInTheDocument();
      });
    });

    it("deleting a workspace shows warning prompt with required messaging", async () => {
      const user = userEvent.setup();
      const deleteSpy = vi.spyOn(notesService, "deleteWorkspace").mockResolvedValue(true);

      renderWithProviders(<AppLayout />);

      const switcherBtn = screen.getAllByRole("button", { name: /switch workspace/i })[0];
      await user.click(switcherBtn);

      const manageBtn = await screen.findByRole("button", { name: /manage workspaces/i });
      await user.click(manageBtn);

      // Find Delete buttons inside the modal (only for non-default workspaces)
      const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
      expect(deleteButtons.length).toBeGreaterThan(0);
      await user.click(deleteButtons[0]);

      // Verify required warning
      await waitFor(() => {
        expect(
          screen.getByText(/deleting this workspace will hide all its contents/i)
        ).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole("button", { name: /confirm delete/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalled();
      });
    });
  });

  describe("4. Dedicated WorkspacesPage", () => {
    it("renders workspaces page with all workspaces and active indicator", async () => {
      renderWithProviders(<WorkspacesPage />, { initialEntries: ["/workspaces"] });

      await waitFor(() => {
        expect(screen.getByText("Your Workspaces (3)")).toBeInTheDocument();
      });

      expect(screen.getByText("Placement Prep")).toBeInTheDocument();
      expect(screen.getByText("Projects")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getAllByText("Default").length).toBeGreaterThanOrEqual(1);
    });

    it("sets a non-default workspace as default", async () => {
      const user = userEvent.setup();
      const setDefaultSpy = vi.spyOn(notesService, "setDefaultWorkspace").mockResolvedValue({
        workspace: {
          id: "w001-0002-4000-8000-000000000002",
          name: "Placement Prep",
          isDefault: true,
        },
      });

      renderWithProviders(<WorkspacesPage />, { initialEntries: ["/workspaces"] });

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /set as default/i }).length).toBeGreaterThan(0);
      });

      const setDefaultBtn = screen.getAllByRole("button", { name: /set as default/i })[0];
      await user.click(setDefaultBtn);

      await waitFor(() => {
        expect(setDefaultSpy).toHaveBeenCalledWith(
          "w001-0002-4000-8000-000000000002",
          expect.anything()
        );
      });
    });

    it("renames a workspace in-place", async () => {
      const user = userEvent.setup();
      const renameSpy = vi.spyOn(notesService, "updateWorkspace").mockResolvedValue({
        workspace: {
          id: "w001-0002-4000-8000-000000000002",
          name: "Placement Preparation 2026",
          isDefault: false,
        },
      });

      renderWithProviders(<WorkspacesPage />, { initialEntries: ["/workspaces"] });

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /^rename$/i }).length).toBeGreaterThan(0);
      });

      const renameBtn = screen.getAllByRole("button", { name: /^rename$/i })[0];
      await user.click(renameBtn);

      const renameInput = screen.getByRole("textbox", { name: /rename workspace/i });
      await user.clear(renameInput);
      await user.type(renameInput, "Placement Preparation 2026");

      const saveBtn = screen.getByRole("button", { name: /^save$/i });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(renameSpy).toHaveBeenCalledWith(
          "w001-0001-4000-8000-000000000001",
          expect.objectContaining({ name: "Placement Preparation 2026" })
        );
      });
    });
  });

  describe("5. Dashboard Scoping by Workspace", () => {
    it("displays active workspace badge on dashboard", async () => {
      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/workspace:/i)).toBeInTheDocument();
      });

      expect(screen.getByText("Default")).toBeInTheDocument();
    });
  });
});
