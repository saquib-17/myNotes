import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * ProtectedRoute wraps a child component and redirects unauthenticated users
 * to the /login page. While the session is being restored (isLoading), it
 * renders a minimal accessible loading state to avoid a flash of the login page.
 *
 * The current location is passed as `state.from` so that the login page can
 * redirect back to the originally requested route after successful authentication.
 *
 * @param {{ children: React.ReactNode }} props
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-stone-50"
        role="status"
        aria-label="Verifying session…"
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
          <span>Verifying session…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
