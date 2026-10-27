import { useState, useEffect, useRef, useCallback } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";
import PageHeader from "../components/PageHeader.jsx";
import { NAV_GROUPS, getRouteMetadata } from "../constants/routes.js";

/**
 * Inline SVG icons for the 9 approved routes.
 * Clean, lightweight, 0 dependencies, accessible.
 */
function NavIcon({ name }) {
  const className = "h-4 w-4 flex-shrink-0 text-stone-500 transition-colors group-hover:text-teal-700 group-[.active]:text-teal-700";
  switch (name) {
    case "Today":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "Notes":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "Questions":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "Documents":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    case "Tasks":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case "Inbox":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      );
    case "Workspaces":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
    case "Revision":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
    case "Journal":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * AppLayout - Shared authenticated layout shell with responsive desktop sidebar,
 * accessible mobile drawer, shared header, content container, and logout control.
 */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  // Editor coordination state
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);

  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const previousFocusRef = useRef(null);

  const metadata = getRouteMetadata(location.pathname);

  // Update document title whenever route changes
  useEffect(() => {
    document.title = `${metadata.title} | MyNotes`;
  }, [metadata.title]);

  // Handle server logout with confirmed success
  async function handleLogout() {
    if (isLoggingOut) return;
    setLogoutError("");
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setIsLoggingOut(false);
      setLogoutError(
        "Sign-out failed — your session may still be active on the server. Try again or close the browser."
      );
    }
  }

  // Intercept logout if an active editor has unsaved changes
  function handleLogoutAttempt() {
    if (editorDirty) {
      setShowLogoutConfirmModal(true);
      return;
    }
    handleLogout();
  }

  // Open mobile drawer with focus trap preparation
  const openDrawer = useCallback(() => {
    previousFocusRef.current = document.activeElement;
    setIsDrawerOpen(true);
  }, []);

  // Close mobile drawer and restore focus
  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    // Restore focus to menu toggle button
    setTimeout(() => {
      menuButtonRef.current?.focus();
    }, 0);
  }, []);

  // Manage drawer focus trap, Escape key, and body scroll lock
  useEffect(() => {
    if (!isDrawerOpen) return;

    // Body scroll lock
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus close button on open
    closeButtonRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDrawer();
        return;
      }

      if (e.key === "Tab") {
        const focusableElements = drawerRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDrawerOpen, closeDrawer]);

  // Render navigation links grouped by category
  const renderNavLinks = (onItemClick) => (
    <nav className="flex-1 space-y-6 px-3 py-4 overflow-y-auto" aria-label="Main Navigation">
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <h2 className="px-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
            {group.title}
          </h2>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
                onClick={onItemClick}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-teal-50 text-teal-900 font-semibold"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`
                }
              >
                <NavIcon name={item.label} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  // Render user profile area & logout action
  const renderUserSection = () => (
    <div className="border-t border-stone-200 p-4 space-y-2">
      {logoutError && (
        <div
          role="alert"
          className="rounded-md bg-red-50 p-2.5 text-xs text-red-700 border border-red-200"
        >
          {logoutError}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-800"
            aria-hidden="true"
          >
            {user?.email ? user.email.charAt(0).toUpperCase() : "U"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-stone-900" title={user?.email || "User"}>
              {user?.email || "Signed in"}
            </p>
            <p className="text-[11px] text-stone-500">Authenticated</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogoutAttempt}
          disabled={isLoggingOut}
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 shadow-2xs hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-60"
          aria-label="Log out of MyNotes"
        >
          {isLoggingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row text-stone-900">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-teal-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-md focus:outline-hidden"
      >
        Skip to main content
      </a>

      {/* Desktop Persistent Sidebar */}
      <aside
        className="hidden md:flex md:w-64 lg:w-72 md:flex-col md:fixed md:inset-y-0 border-r border-stone-200 bg-white z-20"
        aria-label="Desktop Sidebar"
      >
        {/* Branding */}
        <div className="flex h-16 items-center gap-3 border-b border-stone-200 px-6">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-800 text-base font-bold text-white shadow-xs"
            aria-hidden="true"
          >
            M
          </div>
          <div className="min-w-0">
            <span className="block text-base font-bold tracking-tight text-stone-900 leading-tight">
              MyNotes
            </span>
            <span className="block text-xs text-stone-500 truncate">
              Personal Workspace
            </span>
          </div>
        </div>

        {/* Grouped navigation */}
        {renderNavLinks()}

        {/* User identity & logout */}
        {renderUserSection()}
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden flex h-14 items-center justify-between border-b border-stone-200 bg-white px-4 sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-800 text-xs font-bold text-white"
            aria-hidden="true"
          >
            M
          </div>
          <span className="text-sm font-bold tracking-tight text-stone-900">
            MyNotes
          </span>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          onClick={openDrawer}
          aria-expanded={isDrawerOpen}
          aria-controls="mobile-nav-drawer"
          aria-label={isDrawerOpen ? "Navigation menu open" : "Open navigation menu"}
          className="rounded-lg border border-stone-200 p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-teal-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Mobile Navigation Drawer Modal */}
      {isDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          id="mobile-nav-drawer"
          ref={drawerRef}
          className="fixed inset-0 z-50 md:hidden"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity motion-reduce:transition-none"
            onClick={closeDrawer}
            aria-hidden="true"
          />

          {/* Drawer sheet */}
          <div className="fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            {/* Drawer header with close button */}
            <div className="flex h-14 items-center justify-between border-b border-stone-200 px-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-800 text-xs font-bold text-white"
                  aria-hidden="true"
                >
                  M
                </div>
                <span className="text-sm font-bold tracking-tight text-stone-900">
                  MyNotes
                </span>
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeDrawer}
                aria-label="Close navigation menu"
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-teal-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Navigation links (closing drawer on click) */}
            {renderNavLinks(closeDrawer)}

            {/* User identity & logout */}
            {renderUserSection()}
          </div>
        </div>
      )}

      {/* Unsaved Changes Shell Logout Guard Modal */}
      {showLogoutConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <svg className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <h2 className="text-base font-semibold text-stone-900">Unsaved changes</h2>
            </div>
            <p className="text-sm text-stone-600">
              You have unsaved changes in your note. Signing out will discard your unsaved edits. Are you sure you want to sign out?
            </p>
            {editorSaving && (
              <p className="text-xs font-medium text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
                A save is currently in progress. Signing out now may interrupt the save.
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirmModal(false)}
                className="rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Stay and keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirmModal(false);
                  handleLogout();
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Discard changes and sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-64 lg:pl-72 min-w-0">
        {/* Page Top Header */}
        <header className="border-b border-stone-200 bg-white/80 backdrop-blur-xs px-4 sm:px-6 lg:px-8 py-5">
          <PageHeader title={metadata.title} description={metadata.description} />
        </header>

        {/* Consistent content container */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 focus:outline-hidden"
        >
          <Outlet context={{ insideAppLayout: true, setEditorDirty, setEditorSaving }} />
        </main>
      </div>
    </div>
  );
}
