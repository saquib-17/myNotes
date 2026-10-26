/**
 * Frontend authentication test suite.
 *
 * Uses Vitest + React Testing Library + user-event.
 * Mocks the service layer (src/services/auth.service.js) at the module boundary
 * so no real network or database connection is required.
 *
 * Covered scenarios (per Stage 3B spec):
 *  1.  Initial session loading states
 *  2.  Anonymous private-route redirect
 *  3.  Authenticated private-route access (no premature content flash)
 *  4.  Session-check network error and Retry
 *  5.  Successful login and navigation
 *  6.  Invalid login without false navigation (and duplicate-submit prevention)
 *  7.  Registration client-side validation
 *  8.  Registration success redirects to /login, no auto-login
 *  9.  Successful logout
 *  10. Failed logout preserves honest authenticated/error state
 *  11. CSRF token replacement after login used for logout
 *  12. Unsafe return destination rejection (open redirect prevention)
 *  13. Stale session response cannot restore auth after logout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext.jsx";
import { useAuth } from "../context/useAuth.js";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import LoginPage from "../pages/LoginPage.jsx";
import RegisterPage from "../pages/RegisterPage.jsx";
import DashboardPage from "../pages/DashboardPage.jsx";

// ──────────────────────────────────────────────────────────────────────────────
// Service mocks — all network calls are intercepted here
// ──────────────────────────────────────────────────────────────────────────────

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

// Prevent DashboardPage from making real health-check calls
vi.mock("../services/health.service.js", () => ({
  checkBackendHealth: vi.fn(() =>
    Promise.resolve({ ok: true, data: { status: "ok" }, isAborted: false })
  ),
}));

import {
  getMeRequest,
  fetchCsrfToken,
  loginRequest,
  registerRequest,
  logoutRequest,
} from "../services/auth.service.js";

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const MOCK_USER = { id: "u1", email: "alice@example.com", createdAt: "2024-01-01T00:00:00Z" };
const VALID_PASSWORD = "CorrectHorseBatteryStaple!"; // 25 chars — well over the 15-char minimum

// ──────────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Renders the given element inside AuthProvider + MemoryRouter.
 */
function renderWithAuth(ui, { initialEntries = ["/"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

/** Helper: fills the login form and submits it. */
async function fillAndSubmitLogin(email = "alice@example.com", password = VALID_PASSWORD) {
  // Use label text exactly to avoid ambiguity with "Show password" button
  await userEvent.type(screen.getByLabelText("Email address"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
}

/**
 * Tiny component that exposes auth context values as accessible text nodes.
 */
function AuthStateDisplay() {
  const { isLoading, isAuthenticated, sessionError, user } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user ? user.email : "null"}</span>
      <span data-testid="error">{sessionError ?? "null"}</span>
    </div>
  );
}

function AuthStateWithRetry() {
  const { isLoading, isAuthenticated, sessionError, retrySessionCheck } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="error">{sessionError ?? "null"}</span>
      {sessionError && (
        <button onClick={retrySessionCheck} data-testid="retry-btn">Retry</button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Global setup / teardown
// ──────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default safe baseline: unauthenticated, CSRF token always available
  fetchCsrfToken.mockResolvedValue("csrf-token-abc");
  getMeRequest.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. Initial session loading
// ══════════════════════════════════════════════════════════════════════════════

describe("1. Initial session loading", () => {
  it("starts in loading state and transitions to unauthenticated when /me returns null", async () => {
    let resolveMeRequest;
    getMeRequest.mockReturnValue(new Promise((r) => { resolveMeRequest = r; }));

    renderWithAuth(<AuthStateDisplay />);

    expect(screen.getByTestId("loading").textContent).toBe("true");

    act(() => resolveMeRequest(null));

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("error").textContent).toBe("null");
  });

  it("transitions to authenticated when /me returns a user", async () => {
    getMeRequest.mockResolvedValue(MOCK_USER);

    renderWithAuth(<AuthStateDisplay />);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("authenticated").textContent).toBe("true");
    expect(screen.getByTestId("user").textContent).toBe(MOCK_USER.email);
    expect(screen.getByTestId("error").textContent).toBe("null");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Anonymous private-route redirect
// ══════════════════════════════════════════════════════════════════════════════

describe("2. Anonymous private-route redirect", () => {
  it("redirects unauthenticated user from /dashboard to /login", async () => {
    getMeRequest.mockResolvedValue(null);

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div data-testid="dashboard">Dashboard</div>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { initialEntries: ["/dashboard"] }
    );

    await waitFor(() => expect(screen.getByTestId("login-page")).toBeInTheDocument());
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Authenticated private-route access
// ══════════════════════════════════════════════════════════════════════════════

describe("3. Authenticated private-route access", () => {
  it("renders protected content when authenticated", async () => {
    getMeRequest.mockResolvedValue(MOCK_USER);

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div data-testid="dashboard">Dashboard</div>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { initialEntries: ["/dashboard"] }
    );

    await waitFor(() => expect(screen.getByTestId("dashboard")).toBeInTheDocument());
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("does not flash protected content before session restoration completes", async () => {
    let resolveMeRequest;
    getMeRequest.mockReturnValue(new Promise((r) => { resolveMeRequest = r; }));

    renderWithAuth(
      <Routes>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div data-testid="protected-content">Secret</div>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { initialEntries: ["/dashboard"] }
    );

    // While loading, protected content must NOT be visible
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();

    act(() => resolveMeRequest(MOCK_USER));
    await waitFor(() => expect(screen.getByTestId("protected-content")).toBeInTheDocument());
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Session-check network error and Retry
// ══════════════════════════════════════════════════════════════════════════════

describe("4. Session-check network error and Retry", () => {
  it("shows error message and Retry button when /me throws", async () => {
    getMeRequest.mockRejectedValueOnce(new Error("Failed to fetch"));

    renderWithAuth(<AuthStateWithRetry />);

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("retry-btn")).toBeInTheDocument();
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  it("Retry re-runs session check and recovers on success", async () => {
    getMeRequest
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(MOCK_USER);

    renderWithAuth(<AuthStateWithRetry />);

    await waitFor(() => expect(screen.getByTestId("retry-btn")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("retry-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("true");
    });
    expect(screen.getByTestId("error").textContent).toBe("null");
  });

  it("network error does NOT redirect to /login — treated differently from 401", async () => {
    getMeRequest.mockRejectedValueOnce(new Error("Failed to fetch"));

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div data-testid="dashboard">Dashboard</div>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { initialEntries: ["/dashboard"] }
    );

    // ProtectedRoute renders error state (Retry button) instead of redirecting
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    }, { timeout: 3000 });

    // Must NOT have redirected to /login
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("ProtectedRoute shows Retry button with correct test id on session error", async () => {
    getMeRequest.mockRejectedValueOnce(new Error("Failed to fetch"));

    renderWithAuth(
      <Routes>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div data-testid="dashboard">Dashboard</div>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { initialEntries: ["/dashboard"] }
    );

    await waitFor(() => {
      // ProtectedRoute renders a button with id="session-error-retry-btn"
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Successful login
// ══════════════════════════════════════════════════════════════════════════════

describe("5. Successful login", () => {
  it("calls loginRequest and navigates to /dashboard on success", async () => {
    getMeRequest.mockResolvedValue(null);
    loginRequest.mockResolvedValue({ user: MOCK_USER, csrfToken: "new-csrf-token" });

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
      </Routes>,
      { initialEntries: ["/login"] }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument());
    await fillAndSubmitLogin();

    await waitFor(() => expect(screen.getByTestId("dashboard")).toBeInTheDocument());
    expect(loginRequest).toHaveBeenCalledOnce();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Invalid login without false navigation
// ══════════════════════════════════════════════════════════════════════════════

describe("6. Invalid login without false navigation", () => {
  it("shows error alert and stays on /login when credentials are invalid", async () => {
    const { ApiError } = await import("../services/auth.service.js");
    getMeRequest.mockResolvedValue(null);
    loginRequest.mockRejectedValue(new ApiError("Invalid credentials", 401, "Unauthorized"));

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
      </Routes>,
      { initialEntries: ["/login"] }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument());
    await fillAndSubmitLogin();

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid email or password/i);
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
  });

  it("disables submit button and prevents duplicate submission while login is in flight", async () => {
    getMeRequest.mockResolvedValue(null);
    let resolveLogin;
    loginRequest.mockReturnValue(new Promise((r) => { resolveLogin = r; }));

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
      </Routes>,
      { initialEntries: ["/login"] }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument());
    await fillAndSubmitLogin();

    // While in-flight: submit button becomes "Signing in…" and is disabled
    const inFlightBtn = screen.getByRole("button", { name: /signing in/i });
    expect(inFlightBtn).toBeDisabled();

    act(() => resolveLogin({ user: MOCK_USER, csrfToken: "t" }));
    await waitFor(() => expect(screen.getByTestId("dashboard")).toBeInTheDocument());
    expect(loginRequest).toHaveBeenCalledOnce();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Registration validation
// ══════════════════════════════════════════════════════════════════════════════

describe("7. Registration client-side validation", () => {
  beforeEach(() => {
    getMeRequest.mockResolvedValue(null);
  });

  it("shows error when password is too short (< 15 chars)", async () => {
    renderWithAuth(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { initialEntries: ["/register"] }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Email address"), "bob@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "tooshort");
    await userEvent.type(screen.getByLabelText("Confirm password"), "tooshort");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    // The form-level error banner fires on submit via setErrorMessage
    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      const hasMinLengthMessage = alerts.some((a) => /at least 15/i.test(a.textContent));
      expect(hasMinLengthMessage).toBe(true);
    });
    expect(registerRequest).not.toHaveBeenCalled();
  });

  it("shows error when passwords do not match", async () => {
    renderWithAuth(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { initialEntries: ["/register"] }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Email address"), "bob@example.com");
    await userEvent.type(screen.getByLabelText("Password"), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText("Confirm password"), "DifferentPassword!!!!!");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    // The form may show either an inline field alert or a form-level alert (or both).
    // Either way, a /do not match/i message must be present somewhere.
    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      const hasMismatchMessage = alerts.some((a) => /do not match/i.test(a.textContent));
      expect(hasMismatchMessage).toBe(true);
    });
    expect(registerRequest).not.toHaveBeenCalled();
  });

  it("does not trim or modify the password before sending to the server", async () => {
    registerRequest.mockResolvedValue({ user: { id: "u2", email: "bob@example.com", createdAt: "" } });

    renderWithAuth(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
      </Routes>,
      { initialEntries: ["/register"] }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument());

    // Passwords with leading/trailing spaces must be sent exactly as typed
    const spaceyPassword = "  correct horse battery  "; // 25 chars
    await userEvent.type(screen.getByLabelText("Email address"), "bob@example.com");
    await userEvent.type(screen.getByLabelText("Password"), spaceyPassword);
    await userEvent.type(screen.getByLabelText("Confirm password"), spaceyPassword);
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(registerRequest).toHaveBeenCalled());
    const { password } = registerRequest.mock.calls[0][0];
    expect(password).toBe(spaceyPassword);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Registration success
// ══════════════════════════════════════════════════════════════════════════════

describe("8. Registration success: redirect to /login, no auto-login", () => {
  it("redirects to /login after successful registration and does NOT auto-login", async () => {
    getMeRequest.mockResolvedValue(null);
    registerRequest.mockResolvedValue({ user: { id: "u2", email: "new@example.com", createdAt: "" } });

    renderWithAuth(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
      </Routes>,
      { initialEntries: ["/register"] }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Email address"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText("Confirm password"), VALID_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    // Must end up at /login, NOT /dashboard
    await waitFor(() => expect(screen.getByTestId("login-page")).toBeInTheDocument());
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
    // loginRequest must NOT have been called
    expect(loginRequest).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Successful logout
// ══════════════════════════════════════════════════════════════════════════════

describe("9. Successful logout", () => {
  it("clears auth state after confirmed server logout", async () => {
    getMeRequest.mockResolvedValue(MOCK_USER);
    logoutRequest.mockResolvedValue(undefined);

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>,
      { initialEntries: ["/dashboard"] }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(screen.getByTestId("login-page")).toBeInTheDocument());
    expect(logoutRequest).toHaveBeenCalledOnce();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. Failed logout preserves honest state
// ══════════════════════════════════════════════════════════════════════════════

describe("10. Failed logout preserves honest authenticated/error state", () => {
  it("shows error banner and keeps user on dashboard when server logout fails", async () => {
    getMeRequest.mockResolvedValue(MOCK_USER);
    logoutRequest.mockRejectedValue(new Error("Internal Server Error"));

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>,
      { initialEntries: ["/dashboard"] }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    // Error banner must appear (from DashboardPage logoutError state)
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // Must NOT have redirected to /login (user is still authenticated)
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. CSRF token rotation after login
// ══════════════════════════════════════════════════════════════════════════════

describe("11. CSRF token rotation after login", () => {
  it("uses the rotated CSRF token from login response for subsequent requests (e.g. logout)", async () => {
    const preLoginCsrf = "pre-login-csrf";
    const postLoginCsrf = "post-login-csrf-rotated";

    getMeRequest.mockResolvedValue(null);
    fetchCsrfToken.mockResolvedValue(preLoginCsrf);
    loginRequest.mockResolvedValue({ user: MOCK_USER, csrfToken: postLoginCsrf });
    logoutRequest.mockResolvedValue(undefined);

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>,
      { initialEntries: ["/login"] }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument());
    await fillAndSubmitLogin();

    await waitFor(() => expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(logoutRequest).toHaveBeenCalledOnce());
    // Logout must have used the post-login (rotated) token, not the pre-login one
    expect(logoutRequest).toHaveBeenCalledWith(postLoginCsrf);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. Unsafe return destination rejection (open-redirect prevention)
// ══════════════════════════════════════════════════════════════════════════════

describe("12. Unsafe return destination rejection", () => {
  it("redirects to /dashboard instead of a protocol-relative URL after login", async () => {
    getMeRequest.mockResolvedValue(null);
    loginRequest.mockResolvedValue({ user: MOCK_USER, csrfToken: "t" });

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
      </Routes>,
      {
        initialEntries: [
          { pathname: "/login", state: { from: { pathname: "//evil.com/steal" } } },
        ],
      }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument());
    await fillAndSubmitLogin();

    // Must land on /dashboard, not the external destination
    await waitFor(() => expect(screen.getByTestId("dashboard")).toBeInTheDocument());
  });

  it("redirects to /dashboard when return path starts with // (protocol-relative)", async () => {
    getMeRequest.mockResolvedValue(null);
    loginRequest.mockResolvedValue({ user: MOCK_USER, csrfToken: "t" });

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
      </Routes>,
      {
        initialEntries: [
          { pathname: "/login", state: { from: { pathname: "//attacker.example" } } },
        ],
      }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument());
    await fillAndSubmitLogin();

    await waitFor(() => expect(screen.getByTestId("dashboard")).toBeInTheDocument());
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. Stale session response cannot restore auth after logout
// ══════════════════════════════════════════════════════════════════════════════

describe("13. Stale session response cannot restore auth after logout", () => {
  it("discards a /me response that resolves after logout bumped the generation counter", async () => {
    // Scenario: /me is pending; before it resolves, the user logs out.
    // After logout clears state, the stale /me resolves with MOCK_USER.
    // Expected: auth remains cleared (user stays null).

    let resolveMeRequest;
    getMeRequest.mockReturnValue(new Promise((r) => { resolveMeRequest = r; }));

    // We use a custom consumer that triggers logout while /me is in-flight
    let capturedLogout = null;
    function LogoutCapture() {
      const { logout } = useAuth();
      capturedLogout = logout;
      return null;
    }

    renderWithAuth(
      <>
        <AuthStateDisplay />
        <LogoutCapture />
      </>
    );

    // /me is still pending — confirm loading state
    expect(screen.getByTestId("loading").textContent).toBe("true");

    // Call logout while /me is still unresolved.
    // logout() bumps the generation counter and clears state.
    // Even if there's no token, the generation counter increment is the important part.
    logoutRequest.mockResolvedValue(undefined);
    await act(async () => {
      if (capturedLogout) {
        try { await capturedLogout(); } catch { /* no token held yet — expected */ }
      }
    });

    // Now resolve the stale /me with a user
    act(() => resolveMeRequest(MOCK_USER));

    // Wait a tick for any state updates to propagate
    await new Promise((r) => setTimeout(r, 20));

    // Auth must remain cleared — the stale /me response is discarded
    // because the generation counter changed during logout.
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("null");
  });
});
