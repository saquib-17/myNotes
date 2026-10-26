import { useState, useCallback, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import ConnectionStatus from "../components/ConnectionStatus.jsx";
import { checkBackendHealth } from "../services/health.service.js";
import { useAuth } from "../context/useAuth.js";

/**
 * DashboardPage (Today) — Primary authenticated overview page.
 *
 * When rendered within AppLayout, integrates seamlessly into the shell container
 * and displays welcoming user information, honest foundation-status, and a
 * collapsible developer diagnostic health panel.
 *
 * Retains standalone layout fallback for direct component testing.
 */
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const outletCtx = useOutletContext();
  const insideAppLayout = Boolean(outletCtx?.insideAppLayout);

  const [connectionStatus, setConnectionStatus] = useState("loading");
  const [healthData, setHealthData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastChecked, setLastChecked] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const activeControllerRef = useRef(null);

  const performHealthCheck = useCallback(async () => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setConnectionStatus("loading");
    setErrorMessage("");

    const result = await checkBackendHealth(controller.signal);
    if (result.isAborted) return;

    setLastChecked(new Date());
    if (result.ok && result.data) {
      setConnectionStatus("connected");
      setHealthData(result.data);
    } else {
      setConnectionStatus("error");
      setHealthData(null);
      setErrorMessage(result.error || "Connection failed.");
    }
  }, []);

  useEffect(() => {
    performHealthCheck();
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, [performHealthCheck]);

  async function handleLogout() {
    if (isLoggingOut) return;
    setLogoutError("");
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      setIsLoggingOut(false);
      setLogoutError(
        "Sign-out failed — your session may still be active on the server. " +
        "Try again or close the browser to end the session."
      );
    }
  }

  // Core page content rendered in both shell and standalone modes
  const pageContent = (
    <div className="space-y-6">
      {/* Logout error alert (if standalone logout was triggered) */}
      {logoutError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span>{logoutError}</span>
        </div>
      )}

      {/* Welcoming User Overview */}
      <section aria-labelledby="today-welcome-heading" className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 id="today-welcome-heading" className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Welcome back{user ? `, ${user.email.split("@")[0]}` : ""}
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              You are securely signed in to your <strong>MyNotes</strong> workspace.
            </p>
          </div>
          {user && (
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3.5 py-1.5 text-xs font-medium text-teal-800 border border-teal-200 self-start sm:self-auto">
              <span className="h-2 w-2 rounded-full bg-teal-600" aria-hidden="true" />
              Authenticated session active
            </div>
          )}
        </div>

        <div className="border-t border-stone-100 pt-3 text-xs text-stone-500">
          User account: <span className="font-medium text-stone-800">{user?.email || "Unknown"}</span>
        </div>
      </section>

      {/* Stage 4 Honest Foundation Status */}
      <section aria-labelledby="foundation-status-heading" className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs space-y-3">
        <h2 id="foundation-status-heading" className="text-base font-semibold text-stone-900">
          Workspace Foundation Status (Stage 4)
        </h2>
        <p className="text-sm text-stone-600 leading-relaxed">
          The responsive application shell, navigation drawer, and route foundations are active.
          Notes creation, question tracking, document reference, and task management will be implemented in subsequent stages.
        </p>
        <div className="rounded-lg bg-stone-50 p-3.5 border border-stone-100 text-xs text-stone-600">
          <span className="font-semibold text-stone-800">Active Stage:</span> Stage 4 Application Shell &amp; Navigation &bull; No fake metrics or simulated learning records are shown.
        </div>
      </section>

      {/* Collapsible Technical Health Diagnostic */}
      <details className="group rounded-2xl border border-stone-200 bg-white shadow-xs overflow-hidden">
        <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-xs uppercase tracking-wider text-stone-500 hover:text-stone-800 hover:bg-stone-50 transition-colors flex items-center justify-between">
          <span>Developer Status &amp; Technical Health (Diagnostic)</span>
          <span className="text-stone-400 group-open:rotate-180 transition-transform" aria-hidden="true">▼</span>
        </summary>
        <div className="px-6 pb-6 pt-2 border-t border-stone-100 space-y-4">
          <p className="text-xs text-stone-500">
            This panel monitors backend API and database connectivity. It is a technical health diagnostic, not personal learning progress.
          </p>
          <ConnectionStatus
            status={connectionStatus}
            data={healthData}
            errorMessage={errorMessage}
            lastChecked={lastChecked}
            onRetry={performHealthCheck}
          />
        </div>
      </details>
    </div>
  );

  // If already wrapped inside AppLayout, render directly into the content container
  if (insideAppLayout) {
    return pageContent;
  }

  // Standalone fallback: rendered with its own header & logout button for direct testing
  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur-xs sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-lg bg-teal-800 text-white flex items-center justify-center font-bold text-lg shadow-xs"
              aria-hidden="true"
            >
              M
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-stone-900 leading-none">
                MyNotes
              </h1>
              <p className="text-xs text-stone-500 mt-0.5">
                Personal Knowledge &amp; Activity Workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-stone-600">
                <span
                  className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-teal-100 text-teal-800 font-semibold text-xs"
                  aria-hidden="true"
                >
                  {user.email.charAt(0).toUpperCase()}
                </span>
                <span className="max-w-[140px] truncate" title={user.email}>
                  {user.email}
                </span>
              </div>
            )}
            <button
              type="button"
              id="logout-btn"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-xs transition-colors hover:border-stone-300 hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Log out of MyNotes"
            >
              {isLoggingOut ? "Signing out…" : "Log out"}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        {pageContent}
      </main>

      <footer className="border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-400">
        <p>MyNotes Stage 4 &bull; Running locally</p>
      </footer>
    </div>
  );
}
