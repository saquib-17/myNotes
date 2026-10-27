import {
  Routes,
  Route,
  Navigate,
  useInRouterContext,
  RouterProvider,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import LoginWithSuccessNotice from "./components/LoginWithSuccessNotice.jsx";
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
import TrashPage from "./pages/TrashPage.jsx";
import CollectionNotesPage from "./pages/CollectionNotesPage.jsx";
import TagNotesPage from "./pages/TagNotesPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import { getAppRouter } from "./routes/appRoutes.jsx";

/**
 * AppRoutes - Fallback JSX declaration for environments where an external router
 * (such as MemoryRouter in existing unit tests) is already wrapping the component tree.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginWithSuccessNotice />} />
      <Route path="/register" element={<RegisterPage />} />
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
        <Route path="collections/:collectionId" element={<CollectionNotesPage />} />
        <Route path="tags/:tagId" element={<TagNotesPage />} />
        <Route path="trash" element={<TrashPage />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="revision" element={<RevisionPage />} />
        <Route path="journal" element={<JournalPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/**
 * App - Top-level application component.
 * Uses a Data Router (RouterProvider) in production or when custom router is provided.
 * Seamlessly falls back to AppRoutes if already mounted within an outer Router.
 */
export default function App({ router } = {}) {
  const inRouter = useInRouterContext();

  if (inRouter) {
    return (
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    );
  }

  const activeRouter = router || getAppRouter();

  return (
    <AuthProvider>
      <RouterProvider router={activeRouter} />
    </AuthProvider>
  );
}
