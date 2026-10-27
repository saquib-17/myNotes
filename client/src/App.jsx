import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import NotesPage from "./pages/NotesPage.jsx";
import NoteEditorPage from "./pages/NoteEditorPage.jsx";
import QuestionsPage from "./pages/QuestionsPage.jsx";
import DocumentsPage from "./pages/DocumentsPage.jsx";
import TasksPage from "./pages/TasksPage.jsx";
import InboxPage from "./pages/InboxPage.jsx";
import WorkspacesPage from "./pages/WorkspacesPage.jsx";
import RevisionPage from "./pages/RevisionPage.jsx";
import JournalPage from "./pages/JournalPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

/**
 * LoginWithSuccessNotice wraps LoginPage and displays a transient success
 * banner when the user arrives via a successful registration redirect.
 * The notice is shown via router state; it does not persist across reloads.
 */
function LoginWithSuccessNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const registrationSuccess = location.state?.registrationSuccess === true;

  // Clear the state from history so a manual reload does not re-show the banner
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
 * AppRoutes - Declares all application routes.
 *
 * Public routes:
 *   - /login, /register
 *
 * Authenticated routes (nested inside ProtectedRoute > AppLayout):
 *   - / (index -> redirects to /dashboard)
 *   - /dashboard (Today)
 *   - /notes (Notes)
 *   - /questions (Questions)
 *   - /documents (Documents)
 *   - /tasks (Tasks)
 *   - /inbox (Inbox)
 *   - /workspaces (Workspaces)
 *   - /revision (Revision)
 *   - /journal (Journal)
 *
 * Fallback:
 *   - * (NotFoundPage)
 */
function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginWithSuccessNotice />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Authenticated application shell */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="notes/:noteId" element={<NoteEditorPage />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="revision" element={<RevisionPage />} />
        <Route path="journal" element={<JournalPage />} />
      </Route>

      {/* Catch-all: show a friendly 404 page */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/**
 * App - Top-level application component.
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
