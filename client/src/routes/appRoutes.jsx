import {
  Navigate,
  createBrowserRouter,
  createMemoryRouter,
} from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import AppLayout from "../layouts/AppLayout.jsx";
import LoginWithSuccessNotice from "../components/LoginWithSuccessNotice.jsx";
import RegisterPage from "../pages/RegisterPage.jsx";
import DashboardPage from "../pages/DashboardPage.jsx";
import NotesPage from "../pages/NotesPage.jsx";
import NoteEditorPage from "../pages/NoteEditorPage.jsx";
import QuestionsPage from "../pages/QuestionsPage.jsx";
import DocumentsPage from "../pages/DocumentsPage.jsx";
import TasksPage from "../pages/TasksPage.jsx";
import InboxPage from "../pages/InboxPage.jsx";
import WorkspacesPage from "../pages/WorkspacesPage.jsx";
import RevisionPage from "../pages/RevisionPage.jsx";
import JournalPage from "../pages/JournalPage.jsx";
import NotFoundPage from "../pages/NotFoundPage.jsx";

/**
 * Route objects configuration for Data Routers (createBrowserRouter / createMemoryRouter).
 */
export const appRoutes = [
  {
    path: "/login",
    element: <LoginWithSuccessNotice />,
  },
  {
    path: "/register",
    element: <RegisterPage />,
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "notes", element: <NotesPage /> },
      { path: "notes/:noteId", element: <NoteEditorPage /> },
      { path: "questions", element: <QuestionsPage /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "inbox", element: <InboxPage /> },
      { path: "workspaces", element: <WorkspacesPage /> },
      { path: "revision", element: <RevisionPage /> },
      { path: "journal", element: <JournalPage /> },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
];

let defaultRouter = null;

export function getAppRouter() {
  if (!defaultRouter) {
    defaultRouter = createBrowserRouter(appRoutes);
  }
  return defaultRouter;
}

export function createAppRouter(routes = appRoutes, options = {}) {
  if (options.initialEntries) {
    return createMemoryRouter(routes, options);
  }
  return createBrowserRouter(routes, options);
}

