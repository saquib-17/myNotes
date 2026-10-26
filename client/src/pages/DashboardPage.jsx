import { useState, useCallback, useEffect, useRef } from 'react';
import ConnectionStatus from '../components/ConnectionStatus.jsx';
import { checkBackendHealth } from '../services/health.service.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * DashboardPage — Placeholder private workspace view for authenticated users.
 * Shows the existing backend health panel and current user info.
 * Will be replaced by the full application shell in Stage 4.
 */
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState('loading');
  const [healthData, setHealthData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastChecked, setLastChecked] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const activeControllerRef = useRef(null);

  const performHealthCheck = useCallback(async () => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setConnectionStatus('loading');
    setErrorMessage('');

    const result = await checkBackendHealth(controller.signal);
    if (result.isAborted) return;

    setLastChecked(new Date());
    if (result.ok && result.data) {
      setConnectionStatus('connected');
      setHealthData(result.data);
    } else {
      setConnectionStatus('error');
      setHealthData(null);
      setErrorMessage(result.error || 'Connection failed.');
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
    setIsLoggingOut(true);
    try {
      await logout();
      // AuthContext clears user; App routing will redirect to /login
    } catch {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900">
      {/* Header */}
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

          {/* User info and logout */}
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
              {isLoggingOut ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Signing out…</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Log out</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Welcome */}
        <section aria-labelledby="dashboard-heading" className="space-y-3">
          <h2 id="dashboard-heading" className="text-2xl font-bold tracking-tight text-stone-900">
            Welcome back{user ? `, ${user.email.split('@')[0]}` : ''}
          </h2>
          <p className="text-stone-600 text-sm sm:text-base leading-relaxed">
            You are securely signed in to your <strong>MyNotes</strong> workspace.
            The application shell and full note-taking features will be built in{' '}
            <span className="font-medium text-stone-800">Stage 4</span>.
          </p>
          {user && (
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 border border-teal-200">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-600" aria-hidden="true" />
              Authenticated session active
            </div>
          )}
        </section>

        {/* Backend health */}
        <ConnectionStatus
          status={connectionStatus}
          data={healthData}
          errorMessage={errorMessage}
          lastChecked={lastChecked}
          onRetry={performHealthCheck}
        />

        {/* Stage 3B status panel */}
        <section aria-labelledby="stage-heading" className="rounded-xl border border-stone-200 bg-white p-6 shadow-xs space-y-4">
          <h2 id="stage-heading" className="text-base font-semibold text-stone-900">
            Current Implementation Scope
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm text-stone-600">
            {[
              { label: 'Frontend SPA:', detail: 'React + Vite + Tailwind CSS, JavaScript.' },
              { label: 'Backend Server:', detail: 'Node.js + Express with ES modules.' },
              { label: 'Database:', detail: 'PostgreSQL via pg with node-pg-migrate.' },
              { label: 'Authentication:', detail: 'Argon2id + express-session + connect-pg-simple.' },
              { label: 'CSRF Protection:', detail: 'Session-bound synchronizer tokens with Origin validation.' },
              { label: 'Session Storage:', detail: 'PostgreSQL-backed sessions; no localStorage or sessionStorage.' },
            ].map(({ label, detail }) => (
              <li key={label} className="flex items-start gap-2.5 rounded-lg bg-stone-50 p-3 border border-stone-100">
                <span className="text-teal-700 font-bold" aria-hidden="true">✓</span>
                <div>
                  <strong className="text-stone-800 block">{label}</strong>
                  {detail}
                </div>
              </li>
            ))}
          </ul>

          <div className="pt-2 text-xs text-stone-500 border-t border-stone-100 flex flex-col sm:flex-row justify-between gap-2">
            <span>Next Stage: Application Shell &amp; Navigation (Stage 4)</span>
            <span>No external accounts, cloud dependencies, or costs required.</span>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-400">
        <p>MyNotes Stage 3B &bull; Running locally</p>
      </footer>
    </div>
  );
}
