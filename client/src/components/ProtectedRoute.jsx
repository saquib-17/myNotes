import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";
import { CollectionsProvider } from "../context/CollectionsContext.jsx";

/**
 * ProtectedRoute wraps a child component and redirects unauthenticated users
 * to the /login page. While the session is being restored (isLoading), it
 * renders a minimal accessible loading indicator to avoid flashing private content.
 *
 * When session restoration fails due to a network/server error, a Retry action
 * is presented so the user can re-attempt without losing their destination.
 *
 * The current location is passed as `state.from` so that the login page can
 * redirect back to the originally requested route after successful authentication.
 *
 * @param {{ children: import("react").ReactNode }} props
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, sessionError, retrySessionCheck } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-stone-50"
        role="status"
        aria-label="Verifying session..."
      >
        <div className="flex items-center gap-3 text-stone-500 text-sm">
          <svg
            className="h-5 w-5 animate-spin text-teal-700"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12" cy="12" r="10"
              stroke="currentColor" strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Verifying session...</span>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-stone-50 px-4"
        role="alert"
        aria-live="assertive"
      >
        <div className="w-full max-w-sm rounded-2xl border border-red-200 bg-white px-8 py-8 shadow-sm text-center space-y-4">
          <svg
            className="mx-auto h-10 w-10 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div>
            <h2 className="text-base font-semibold text-stone-900">Connection error</h2>
            <p className="mt-1 text-sm text-stone-500">{sessionError}</p>
          </div>
          <button
            type="button"
            id="session-error-retry-btn"
            onClick={retrySessionCheck}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <CollectionsProvider>{children}</CollectionsProvider>;
}
