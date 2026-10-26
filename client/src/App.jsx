import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';

/**
 * LoginWithSuccessNotice wraps LoginPage and displays a transient success
 * banner when the user arrives via a successful registration redirect.
 * The notice is shown via router state; it does not persist across reloads.
 */
function LoginWithSuccessNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const registrationSuccess = location.state?.registrationSuccess === true;

  // Clear the state from history so a manual reload doesn't re-show the banner
  useEffect(() => {
    if (registrationSuccess) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {registrationSuccess && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-5 py-3 text-sm font-medium text-teal-900 shadow-md"
        >
          <svg
            className="h-4 w-4 text-teal-600 flex-shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Account created successfully. Please sign in.
        </div>
      )}
      <LoginPage />
    </>
  );
}

/**
 * AuthenticatedRoot — Redirects authenticated users away from the bare root
 * path to the dashboard, and unauthenticated users to /login.
 * Renders nothing while the session is being determined.
 */
function AuthenticatedRoot() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-stone-50"
        role="status"
        aria-label="Loading…"
      >
        <div className="flex items-center gap-3 text-stone-500 text-sm">
          <svg
            className="h-5 w-5 animate-spin text-teal-700"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

/**
 * AppRoutes — Declares all application routes.
 * Must be rendered inside AuthProvider and BrowserRouter (provided in main.jsx).
 */
function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginWithSuccessNotice />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Root redirect based on auth state */}
      <Route path="/" element={<AuthenticatedRoot />} />

      {/* Catch-all: redirect unknown routes to root which resolves auth state */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * App — Top-level application component.
 * Composes AuthProvider (which manages session state) around the route tree.
 * BrowserRouter is provided in main.jsx so that App itself remains testable.
 */
export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
