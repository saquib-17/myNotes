import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import SettingsPage from "../pages/SettingsPage.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import AppLayout from "../layouts/AppLayout.jsx";
import * as notesService from "../services/notes.service.js";

let mockIsAuthenticated = true;
let mockUser = {
  id: "user-123",
  email: "alex@example.com",
  name: "Alex Doe",
  displayName: "Alex Doe",
  createdAt: "2026-01-15T10:00:00.000Z",
};
let mockLogout = vi.fn().mockResolvedValue(true);
let mockUpdateUser = vi.fn();

vi.mock("../context/useAuth.js", () => ({
  useAuth: () => ({
    user: mockIsAuthenticated ? mockUser : null,
    isAuthenticated: mockIsAuthenticated,
    logout: mockLogout,
    updateUser: mockUpdateUser,
    getCsrfToken: vi.fn().mockResolvedValue("test-csrf-token"),
  }),
}));

vi.mock("../context/useWorkspace.js", () => ({
  useWorkspace: () => ({
    workspaces: [{ id: "ws-1", name: "Personal", isDefault: true }],
    activeWorkspaceId: "ws-1",
    activeWorkspace: { id: "ws-1", name: "Personal", isDefault: true },
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

const MOCK_PROFILE_RESPONSE = {
  id: "user-123",
  email: "alex@example.com",
  name: "Alex Doe",
  displayName: "Alex Doe",
  createdAt: "2026-01-15T10:00:00.000Z",
};

const MOCK_SESSIONS_RESPONSE = {
  total: 2,
  sessions: [
    {
      id: "sess_curr_123456",
      createdAt: "2026-10-28T10:00:00.000Z",
      lastSeenAt: "2026-10-28T12:00:00.000Z",
      expiresAt: "2026-11-04T10:00:00.000Z",
      currentSession: true,
    },
    {
      id: "sess_other_789012",
      createdAt: "2026-10-27T08:00:00.000Z",
      lastSeenAt: "2026-10-27T09:30:00.000Z",
      expiresAt: "2026-11-03T08:00:00.000Z",
      currentSession: false,
    },
  ],
};

function renderSettingsPage({ initialEntries = ["/settings"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login Page Mock</div>} />
        <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard Mock</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Profile & Settings Feature Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockUser = {
      id: "user-123",
      email: "alex@example.com",
      name: "Alex Doe",
      displayName: "Alex Doe",
      createdAt: "2026-01-15T10:00:00.000Z",
    };
    mockLogout = vi.fn().mockResolvedValue(true);
    mockUpdateUser = vi.fn();

    vi.spyOn(notesService, "fetchProfile").mockResolvedValue(MOCK_PROFILE_RESPONSE);
    vi.spyOn(notesService, "fetchSessions").mockResolvedValue(MOCK_SESSIONS_RESPONSE);
  });

  describe("1. Route Protection & Initial Render", () => {
    it("redirects unauthenticated user to /login", async () => {
      mockIsAuthenticated = false;
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByTestId("login-page")).toBeInTheDocument();
      });
      expect(screen.queryByText(/Profile & Settings/i)).not.toBeInTheDocument();
    });

    it("renders profile information with read-only email and editable display name", async () => {
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Profile & Settings/i })).toBeInTheDocument();
      });

      // Email field is read-only
      const emailInput = screen.getByLabelText(/Email Address/i);
      expect(emailInput).toHaveValue("alex@example.com");
      expect(emailInput).toHaveAttribute("readonly");
      expect(emailInput).toBeDisabled();

      // Display name input is populated and editable
      const nameInput = screen.getByLabelText(/Display Name/i);
      expect(nameInput).toHaveValue("Alex Doe");

      // Member since date renders
      expect(screen.getByText(/Member since:/i)).toBeInTheDocument();
    });
  });

  describe("2. Profile Display Name Update", () => {
    it("updates display name successfully and renders success notification", async () => {
      const updateSpy = vi.spyOn(notesService, "updateProfile").mockResolvedValue({
        id: "user-123",
        email: "alex@example.com",
        name: "Alex Updated",
        displayName: "Alex Updated",
      });

      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/Display Name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Display Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Alex Updated");

      const saveBtn = screen.getByRole("button", { name: /Save Profile/i });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith({
          name: "Alex Updated",
          csrfToken: "test-csrf-token",
        });
      });

      expect(await screen.findByRole("status")).toHaveTextContent(/Display name updated successfully/i);
      expect(mockUpdateUser).toHaveBeenCalledWith({
        name: "Alex Updated",
        displayName: "Alex Updated",
      });
    });

    it("shows error banner when display name exceeds 60 characters", async () => {
      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/Display Name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Display Name/i);
      // Remove maxLength attribute to test client validation handler
      nameInput.removeAttribute("maxlength");
      await user.clear(nameInput);
      await user.type(nameInput, "A".repeat(65));

      const saveBtn = screen.getByRole("button", { name: /Save Profile/i });
      await user.click(saveBtn);

      expect(await screen.findByRole("alert")).toHaveTextContent(/cannot exceed 60 characters/i);
    });

    it("shows error banner when profile update API fails", async () => {
      vi.spyOn(notesService, "updateProfile").mockRejectedValue(
        new Error("Database connection error")
      );

      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/Display Name/i)).toBeInTheDocument();
      });

      const saveBtn = screen.getByRole("button", { name: /Save Profile/i });
      await user.click(saveBtn);

      expect(await screen.findByRole("alert")).toHaveTextContent(/Database connection error/i);
    });
  });

  describe("3. Change Password Form & Validation", () => {
    it("validates empty inputs on submit", async () => {
      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Update Password/i })).toBeInTheDocument();
      });

      const submitBtn = screen.getByRole("button", { name: /Update Password/i });
      await user.click(submitBtn);

      expect(await screen.findByRole("alert")).toHaveTextContent(/Please enter your current password/i);
    });

    it("validates new password minimum length (< 15 characters)", async () => {
      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^Current Password/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/^Current Password/i), "CurrentPass15Chars!");
      await user.type(screen.getByLabelText(/^New Password/i), "ShortPass123");
      await user.type(screen.getByLabelText(/^Confirm New Password/i), "ShortPass123");

      const submitBtn = screen.getByRole("button", { name: /Update Password/i });
      await user.click(submitBtn);

      expect(await screen.findByRole("alert")).toHaveTextContent(/at least 15 characters long/i);
    });

    it("validates password confirmation mismatch", async () => {
      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^Current Password/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/^Current Password/i), "CurrentPass15Chars!");
      await user.type(screen.getByLabelText(/^New Password/i), "ValidNewPassword15Chars!");
      await user.type(screen.getByLabelText(/^Confirm New Password/i), "MismatchedPassword15!");

      const submitBtn = screen.getByRole("button", { name: /Update Password/i });
      await user.click(submitBtn);

      expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
    });

    it("prevents using the same password as current", async () => {
      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^Current Password/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/^Current Password/i), "SamePassword15Chars!");
      await user.type(screen.getByLabelText(/^New Password/i), "SamePassword15Chars!");
      await user.type(screen.getByLabelText(/^Confirm New Password/i), "SamePassword15Chars!");

      const submitBtn = screen.getByRole("button", { name: /Update Password/i });
      await user.click(submitBtn);

      expect(await screen.findByRole("alert")).toHaveTextContent(/cannot be the same as your current password/i);
    });

    it("successfully changes password, clears inputs, and displays success message", async () => {
      const changePassSpy = vi.spyOn(notesService, "changePassword").mockResolvedValue({
        success: true,
        message: "Password changed successfully. All other sessions have been signed out.",
      });

      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^Current Password/i)).toBeInTheDocument();
      });

      const currentInput = screen.getByLabelText(/^Current Password/i);
      const newInput = screen.getByLabelText(/^New Password/i);
      const confirmInput = screen.getByLabelText(/^Confirm New Password/i);

      await user.type(currentInput, "OldPassword15Chars!");
      await user.type(newInput, "BrandNewPassword15Chars!");
      await user.type(confirmInput, "BrandNewPassword15Chars!");

      const submitBtn = screen.getByRole("button", { name: /Update Password/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(changePassSpy).toHaveBeenCalledWith({
          currentPassword: "OldPassword15Chars!",
          newPassword: "BrandNewPassword15Chars!",
          confirmPassword: "BrandNewPassword15Chars!",
          csrfToken: "test-csrf-token",
        });
      });

      expect(await screen.findByRole("status")).toHaveTextContent(
        /Password changed successfully\. All other sessions have been signed out/i
      );

      // Verify form was reset
      expect(currentInput).toHaveValue("");
      expect(newInput).toHaveValue("");
      expect(confirmInput).toHaveValue("");
    });

    it("toggles password visibility with accessible show/hide buttons", async () => {
      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^Current Password/i)).toBeInTheDocument();
      });

      const currentInput = screen.getByLabelText(/^Current Password/i);
      expect(currentInput).toHaveAttribute("type", "password");

      const toggleBtn = screen.getByRole("button", { name: /Show current password/i });
      await user.click(toggleBtn);

      expect(currentInput).toHaveAttribute("type", "text");
      expect(screen.getByRole("button", { name: /Hide current password/i })).toBeInTheDocument();
    });
  });

  describe("4. Active Sessions Section", () => {
    it("renders sessions list with current session indicator", async () => {
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByText("sess_curr_123456")).toBeInTheDocument();
        expect(screen.getByText("sess_other_789012")).toBeInTheDocument();
      });

      expect(screen.getByText("Current Session", { selector: "span" })).toBeInTheDocument();
      expect(screen.getByText("Other Session", { selector: "span" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Sign out current session/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Sign out other sessions/i })).toBeInTheDocument();
    });

    it("signs out other sessions upon confirmation", async () => {
      const logoutOthersSpy = vi.spyOn(notesService, "logoutOtherSessions").mockResolvedValue({
        success: true,
        count: 1,
        message: "All other sessions have been signed out.",
      });

      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Sign out other sessions/i })).toBeInTheDocument();
      });

      // 1. Click button to trigger confirmation modal
      await user.click(screen.getByRole("button", { name: /Sign out other sessions/i }));

      // 2. Modal is displayed
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/Sign out all other sessions\?/i)).toBeInTheDocument();

      // 3. Confirm sign out
      await user.click(screen.getByRole("button", { name: /Confirm Sign Out/i }));

      await waitFor(() => {
        expect(logoutOthersSpy).toHaveBeenCalledWith({ csrfToken: "test-csrf-token" });
      });

      expect(await screen.findByRole("status")).toHaveTextContent(/All other sessions have been signed out/i);
    });

    it("signs out current session and redirects to /login", async () => {
      const logoutCurrSpy = vi.spyOn(notesService, "logoutCurrentSession").mockResolvedValue(true);

      const user = userEvent.setup();
      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Sign out current session/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Sign out current session/i }));

      await waitFor(() => {
        expect(logoutCurrSpy).toHaveBeenCalledWith({ csrfToken: "test-csrf-token" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("login-page")).toBeInTheDocument();
      });
    });
  });

  describe("5. Sidebar Navigation to Settings", () => {
    it("renders Settings link in AppLayout navigation", async () => {
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AppLayout />
        </MemoryRouter>
      );

      const settingsLinks = screen.getAllByRole("link", { name: /settings/i });
      expect(settingsLinks.length).toBeGreaterThan(0);
      expect(settingsLinks[0]).toHaveAttribute("href", "/settings");
    });
  });
});
