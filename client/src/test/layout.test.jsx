/**
 * Layout and Navigation test suite for Stage 4.
 *
 * Verifies:
 *  1. Authenticated shared layout rendering (desktop sidebar, branding, groups, user identity).
 *  2. Public pages do not show private navigation shell.
 *  3. Anonymous private-route redirection for all 9 approved routes.
 *  4. Correct page rendering for every approved route.
 *  5. Active navigation semantics (aria-current="page" on NavLink).
 *  6. Sidebar navigation preserves authenticated state without re-verifying.
 *  7. Intended-route return after successful login.
 *  8. Unsafe return destination rejection defaults to /dashboard.
 *  9. Mobile drawer open/close via toggle button, close button, and route item click.
 * 10. Mobile drawer Escape key and focus restoration behavior.
 * 11. Layout logout success redirects to /login.
 * 12. Layout logout failure displays honest error message.
 * 13. Not found page rendering for unknown routes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../App.jsx";
import { APPROVED_ROUTES } from "../constants/routes.js";

// Mock the auth service layer
vi.mock("../services/auth.service.js", () => ({
  getMeRequest: vi.fn(),
  fetchCsrfToken: vi.fn(),
  loginRequest: vi.fn(),
  registerRequest: vi.fn(),
  logoutRequest: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
    }
  },
}));

// Mock health check service
vi.mock("../services/health.service.js", () => ({
  checkBackendHealth: vi.fn(() =>
    Promise.resolve({ ok: true, data: { status: "ok" }, isAborted: false })
  ),
}));

import {
  getMeRequest,
  fetchCsrfToken,
  loginRequest,
  logoutRequest,
} from "../services/auth.service.js";

const MOCK_USER = {
  id: "u1",
  email: "developer@example.com",
  createdAt: "2024-01-01T00:00:00Z",
};

/**
 * Helper to render the application with custom initial routing entries.
 */
function renderApp({ initialEntries = ["/dashboard"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>
  );
}

describe("Stage 4: Responsive Application Shell & Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Authenticated Shared Layout
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Authenticated Shared Layout", () => {
    it("renders branding, navigation groups, user identity, and skip link", async () => {
      getMeRequest.mockResolvedValue(MOCK_USER);

      renderApp({ initialEntries: ["/dashboard"] });

      // Wait for layout to render
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
      });

      // Skip to main content link
      expect(screen.getByRole("link", { name: /skip to main content/i })).toBeInTheDocument();

      // Navigation groups
      expect(screen.getByRole("heading", { name: /home/i, level: 2 })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /knowledge/i, level: 2 })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /daily/i, level: 2 })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /growth/i, level: 2 })).toBeInTheDocument();

      // User identity email displayed
      expect(screen.getAllByText("developer@example.com").length).toBeGreaterThanOrEqual(1);

      // Logout button present in layout
      expect(screen.getByRole("button", { name: /log out of mynotes/i })).toBeInTheDocument();
    });

    it("supports collapsing and expanding desktop sidebar with localStorage persistence", async () => {
      getMeRequest.mockResolvedValue(MOCK_USER);
      const user = userEvent.setup();

      renderApp({ initialEntries: ["/dashboard"] });

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /collapse sidebar/i }).length).toBeGreaterThanOrEqual(1);
      });

      const collapseBtn = screen.getAllByRole("button", { name: /collapse sidebar/i })[0];
      await user.click(collapseBtn);

      // Now sidebar should have expand button
      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /expand sidebar/i }).length).toBeGreaterThanOrEqual(1);
      });
      expect(localStorage.getItem("mynotes_sidebar_collapsed")).toBe("true");

      // Clicking expand restores it
      const expandBtn = screen.getAllByRole("button", { name: /expand sidebar/i })[0];
      await user.click(expandBtn);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /collapse sidebar/i }).length).toBeGreaterThanOrEqual(1);
      });
      expect(localStorage.getItem("mynotes_sidebar_collapsed")).toBe("false");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Public Pages Isolation
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. Public Pages Isolation", () => {
    it("public /login page does NOT display private navigation sidebar", async () => {
      getMeRequest.mockResolvedValue(null);

      renderApp({ initialEntries: ["/login"] });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
      });

      // Private navigation landmark should NOT be in the document
      expect(screen.queryByRole("navigation", { name: /main navigation/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /knowledge/i })).not.toBeInTheDocument();
    });

    it("public /register page does NOT display private navigation sidebar", async () => {
      getMeRequest.mockResolvedValue(null);

      renderApp({ initialEntries: ["/register"] });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
      });

      expect(screen.queryByRole("navigation", { name: /main navigation/i })).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Anonymous Redirection for Approved Routes
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. Anonymous Private-Route Redirection", () => {
    for (const route of APPROVED_ROUTES) {
      it(`redirects unauthenticated user from ${route} to /login`, async () => {
        getMeRequest.mockResolvedValue(null);

        renderApp({ initialEntries: [route] });

        await waitFor(() => {
          expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
        });

        expect(screen.queryByRole("navigation", { name: /main navigation/i })).not.toBeInTheDocument();
      });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Correct Page Rendering for Every Approved Route
  // ──────────────────────────────────────────────────────────────────────────
  describe("4. Correct Page Rendering for Every Approved Route", () => {
    const routeExpectations = [
      { route: "/dashboard", title: "Today", phrase: "Welcome back" },
      { route: "/notes", title: "Notes", phrase: "Your notes and documentation will live here." },
      { route: "/questions", title: "Questions", phrase: "Collect important questions and track your understanding." },
      { route: "/documents", title: "Documents", phrase: "Store and reference important documents here." },
      { route: "/tasks", title: "Tasks", phrase: "Manage daily tasks and to-dos here." },
      { route: "/inbox", title: "Inbox", phrase: "Capture and process incoming items." },
      { route: "/workspaces", title: "Workspaces", phrase: "Organize your work into focused workspaces." },
      { route: "/revision", title: "Revision", phrase: "Track spaced repetition and revision schedules." },
      { route: "/journal", title: "Journal", phrase: "Reflect and write daily journal entries." },
    ];

    for (const { route, title, phrase } of routeExpectations) {
      it(`renders correct header and content for ${route}`, async () => {
        getMeRequest.mockResolvedValue(MOCK_USER);

        renderApp({ initialEntries: [route] });

        await waitFor(() => {
          expect(screen.getByRole("heading", { name: title, level: 1 })).toBeInTheDocument();
        });

        expect(screen.getByText(new RegExp(phrase, "i"))).toBeInTheDocument();
      });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Active Navigation Semantics
  // ──────────────────────────────────────────────────────────────────────────
  describe("5. Active Navigation Semantics", () => {
    it("marks active route link with aria-current='page'", async () => {
      getMeRequest.mockResolvedValue(MOCK_USER);

      renderApp({ initialEntries: ["/notes"] });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Notes", level: 1 })).toBeInTheDocument();
      });

      // The Notes link should have aria-current="page"
      const notesLink = screen.getByRole("link", { name: /^notes$/i });
      expect(notesLink).toHaveAttribute("aria-current", "page");

      // Other links should not have aria-current="page"
      const todayLink = screen.getByRole("link", { name: /^today$/i });
      expect(todayLink).not.toHaveAttribute("aria-current", "page");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Navigation Without Losing Auth State
  // ──────────────────────────────────────────────────────────────────────────
  describe("6. Sidebar Navigation Preserves State", () => {
    it("navigates between routes without re-fetching session or losing auth", async () => {
      getMeRequest.mockResolvedValue(MOCK_USER);

      renderApp({ initialEntries: ["/dashboard"] });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
      });

      // Initial check should only have happened once
      expect(getMeRequest).toHaveBeenCalledTimes(1);

      // Click to navigate to Notes
      const notesLink = screen.getByRole("link", { name: /^notes$/i });
      await userEvent.click(notesLink);

      // Route heading changes to Notes
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Notes", level: 1 })).toBeInTheDocument();
      });

      // Still only called once — no unnecessary network check on client-side nav
      expect(getMeRequest).toHaveBeenCalledTimes(1);

      // Click to navigate to Questions
      const questionsLink = screen.getByRole("link", { name: /^questions$/i });
      await userEvent.click(questionsLink);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Questions", level: 1 })).toBeInTheDocument();
      });
      expect(getMeRequest).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Intended Route Return After Login
  // ──────────────────────────────────────────────────────────────────────────
  describe("7. Intended Route Return After Login", () => {
    it("redirects user back to /notes after authenticating from /notes", async () => {
      getMeRequest.mockResolvedValue(null);
      fetchCsrfToken.mockResolvedValue("csrf-token");
      loginRequest.mockResolvedValue({ user: MOCK_USER, csrfToken: "csrf-token-new" });

      // User visits /notes directly while unauthenticated
      renderApp({ initialEntries: ["/notes"] });

      // Gets redirected to login
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
      });

      // Submit valid credentials
      await userEvent.type(screen.getByLabelText("Email address"), "developer@example.com");
      await userEvent.type(screen.getByLabelText("Password"), "CorrectHorseBatteryStaple!");
      await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

      // Must land on /notes
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Notes", level: 1 })).toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Safe Return Path Policy
  // ──────────────────────────────────────────────────────────────────────────
  describe("8. Unsafe Return Path Rejection", () => {
    it("redirects to /dashboard if state.from was an unsafe external URL", async () => {
      getMeRequest.mockResolvedValue(null);
      fetchCsrfToken.mockResolvedValue("csrf-token");
      loginRequest.mockResolvedValue({ user: MOCK_USER, csrfToken: "csrf-token-new" });

      renderApp({
        initialEntries: [
          { pathname: "/login", state: { from: { pathname: "//evil.com/hack" } } },
        ],
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
      });

      await userEvent.type(screen.getByLabelText("Email address"), "developer@example.com");
      await userEvent.type(screen.getByLabelText("Password"), "CorrectHorseBatteryStaple!");
      await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

      // Unsafe path rejected -> lands on /dashboard (Today)
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Mobile Drawer Interactions
  // ──────────────────────────────────────────────────────────────────────────
  describe("9. Mobile Drawer Open and Close Interactions", () => {
    it("opens drawer via hamburger button and closes via close button", async () => {
      getMeRequest.mockResolvedValue(MOCK_USER);

      renderApp({ initialEntries: ["/dashboard"] });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
      });

      const menuBtn = screen.getByRole("button", { name: /open navigation menu/i });
      expect(menuBtn).toHaveAttribute("aria-expanded", "false");

      // Open drawer
      await userEvent.click(menuBtn);
      expect(menuBtn).toHaveAttribute("aria-expanded", "true");

      const drawer = screen.getByRole("dialog", { name: /navigation menu/i });
      expect(drawer).toBeInTheDocument();

      // Close drawer via close button inside
      const closeBtn = within(drawer).getByRole("button", { name: /close navigation menu/i });
      await userEvent.click(closeBtn);

      expect(screen.queryByRole("dialog", { name: /navigation menu/i })).not.toBeInTheDocument();
    });

    it("closes drawer when selecting a navigation link", async () => {
      getMeRequest.mockResolvedValue(MOCK_USER);

      renderApp({ initialEntries: ["/dashboard"] });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
      });

      const menuBtn = screen.getByRole("button", { name: /open navigation menu/i });
      await userEvent.click(menuBtn);

      // Find the Tasks link inside the open drawer and click it
      const drawer = screen.getByRole("dialog", { name: /navigation menu/i });
      const tasksLink = within(drawer).getByRole("link", { name: /^tasks$/i });
      await userEvent.click(tasksLink);

      // Drawer should close
      expect(screen.queryByRole("dialog", { name: /navigation menu/i })).not.toBeInTheDocument();

      // Content updates to Tasks
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Tasks", level: 1 })).toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Mobile Drawer Escape Key and Focus Restoration
  // ──────────────────────────────────────────────────────────────────────────
  describe("10. Mobile Drawer Keyboard Accessibility", () => {
    it("closes drawer on Escape key press and restores focus to menu button", async () => {
      getMeRequest.mockResolvedValue(MOCK_USER);

      renderApp({ initialEntries: ["/dashboard"] });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
      });

      const menuBtn = screen.getByRole("button", { name: /open navigation menu/i });
      await userEvent.click(menuBtn);

      const drawer = screen.getByRole("dialog", { name: /navigation menu/i });
      expect(drawer).toBeInTheDocument();

      // Press Escape
      await userEvent.keyboard("{Escape}");

      // Drawer is closed
      expect(screen.queryByRole("dialog", { name: /navigation menu/i })).not.toBeInTheDocument();

      // Menu button receives focus back
      await waitFor(() => {
        expect(menuBtn).toHaveFocus();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 11. Logout Success & Failure in Shell
  // ──────────────────────────────────────────────────────────────────────────
  describe("11. Logout Control in Application Shell", () => {
    it("successfully logs out and redirects to /login", async () => {
      getMeRequest.mockResolvedValue(MOCK_USER);
      logoutRequest.mockResolvedValue(undefined);

      renderApp({ initialEntries: ["/dashboard"] });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
      });

      const logoutBtn = screen.getByRole("button", { name: /log out of mynotes/i });
      await userEvent.click(logoutBtn);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
      });
      expect(logoutRequest).toHaveBeenCalledOnce();
    });

    it("displays honest error alert when server logout fails, preserving auth", async () => {
      getMeRequest.mockResolvedValue(MOCK_USER);
      logoutRequest.mockRejectedValue(new Error("Server error"));

      renderApp({ initialEntries: ["/dashboard"] });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
      });

      const logoutBtn = screen.getByRole("button", { name: /log out of mynotes/i });
      await userEvent.click(logoutBtn);

      // Honest alert appears in user section
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
      expect(screen.getByText(/sign-out failed/i)).toBeInTheDocument();

      // Remains on authenticated page
      expect(screen.getByRole("heading", { name: "Today", level: 1 })).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 12. Not Found Page
  // ──────────────────────────────────────────────────────────────────────────
  describe("12. Not Found Route Handling", () => {
    it("renders NotFoundPage for unmapped paths", async () => {
      getMeRequest.mockResolvedValue(MOCK_USER);

      renderApp({ initialEntries: ["/some-unknown-path-xyz"] });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
      });
    });
  });
});
