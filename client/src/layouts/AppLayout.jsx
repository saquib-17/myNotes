import { useState, useEffect, useRef, useCallback } from "react";
import { NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";
import { useCollections } from "../context/useCollections.js";
import { useTags } from "../context/useTags.js";
import { useWorkspace } from "../context/useWorkspace.js";
import { TAG_LIMITS, WORKSPACE_LIMITS } from "../services/notes.service.js";
import PageHeader from "../components/PageHeader.jsx";
import { NAV_GROUPS, getRouteMetadata } from "../constants/routes.js";

/**
 * Inline SVG icons for the 9 approved routes.
 * Clean, lightweight, 0 dependencies, accessible.
 * Midnight Indigo theme styling.
 */
function NavIcon({ name }) {
  const className = "h-4 w-4 flex-shrink-0 text-[#667085] transition-colors group-hover:text-[#111827] group-[.active]:text-[#2948D8]";
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
    case "Revision & Doubts":
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
    case "Settings":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "Trash":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * AppLayout - Shared authenticated layout shell with responsive desktop sidebar,
 * accessible mobile drawer, shared header, content container, Midnight Indigo theming,
 * and dark mode support with accessible contrast.
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

  // Collections state
  const { collections, createCollection } = useCollections();
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [createCollectionInput, setCreateCollectionInput] = useState("");
  const [createCollectionError, setCreateCollectionError] = useState(null);
  const [isSubmittingCollection, setIsSubmittingCollection] = useState(false);

  // Tags state
  const { tags, createTag } = useTags();
  const [showCreateTagModal, setShowCreateTagModal] = useState(false);
  const [createTagInput, setCreateTagInput] = useState("");
  const [createTagError, setCreateTagError] = useState(null);
  const [isSubmittingTag, setIsSubmittingTag] = useState(false);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("mynotes_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mynotes_sidebar_collapsed", String(next));
      } catch {
        // ignore localStorage access errors
      }
      return next;
    });
  };

  const handleCreateTagSubmit = async (e) => {
    e.preventDefault();
    const trimmed = createTagInput.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setCreateTagError("Tag name cannot be empty.");
      return;
    }
    if (trimmed.length > TAG_LIMITS.MAX_NAME_LENGTH) {
      setCreateTagError(`Tag name cannot exceed ${TAG_LIMITS.MAX_NAME_LENGTH} characters.`);
      return;
    }

    setIsSubmittingTag(true);
    setCreateTagError(null);

    try {
      const result = await createTag(trimmed);
      setShowCreateTagModal(false);
      setCreateTagInput("");
      if (result?.id) {
        navigate(`/tags/${result.id}`);
      }
    } catch (err) {
      if (err.status === 409 || err.code === "TAG_CONFLICT") {
        setCreateTagError("A tag with this name already exists.");
      } else {
        setCreateTagError(err?.message || "Failed to create tag.");
      }
    } finally {
      setIsSubmittingTag(false);
    }
  };

  const handleCreateCollectionSubmit = async (e) => {
    e.preventDefault();
    const trimmed = createCollectionInput.trim();
    if (!trimmed) {
      setCreateCollectionError("Collection name cannot be empty.");
      return;
    }
    if (trimmed.length > 80) {
      setCreateCollectionError("Collection name cannot exceed 80 characters.");
      return;
    }

    setIsSubmittingCollection(true);
    setCreateCollectionError(null);

    try {
      const result = await createCollection(trimmed);
      setShowCreateCollectionModal(false);
      setCreateCollectionInput("");
      if (result?.id) {
        navigate(`/collections/${result.id}`);
      }
    } catch (err) {
      if (err.status === 409 || err.code === "COLLECTION_CONFLICT") {
        setCreateCollectionError("A collection with this name already exists.");
      } else {
        setCreateCollectionError(err?.message || "Failed to create collection.");
      }
    } finally {
      setIsSubmittingCollection(false);
    }
  };

  // Workspaces state
  const {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    switchWorkspace,
    createNewWorkspace,
    renameWorkspace,
    removeWorkspace,
    setAsDefault,
  } = useWorkspace();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [showManageWorkspacesModal, setShowManageWorkspacesModal] = useState(false);
  const [manageCreateName, setManageCreateName] = useState("");
  const [manageCreateError, setManageCreateError] = useState(null);
  const [isManageCreating, setIsManageCreating] = useState(false);
  const [manageEditingId, setManageEditingId] = useState(null);
  const [manageEditingName, setManageEditingName] = useState("");
  const [manageRenameError, setManageRenameError] = useState(null);
  const [isManageRenaming, setIsManageRenaming] = useState(false);
  const [manageDeleteTarget, setManageDeleteTarget] = useState(null);
  const [manageDeleteError, setManageDeleteError] = useState(null);
  const [isManageDeleting, setIsManageDeleting] = useState(false);

  // Global search input state & debounced navigation
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");

  // If currently on /search, sync input with ?q= param
  useEffect(() => {
    if (location.pathname === "/search") {
      const searchParams = new URLSearchParams(location.search);
      setGlobalSearchTerm(searchParams.get("q") || "");
    }
  }, [location.pathname, location.search]);

  // Debounce search input by 300ms
  useEffect(() => {
    const trimmed = globalSearchTerm.trim();
    if (!trimmed) return;

    // Check if the current URL already matches this query
    const searchParams = new URLSearchParams(location.search);
    if (location.pathname === "/search" && searchParams.get("q") === trimmed) {
      return;
    }

    const timer = setTimeout(() => {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }, 300);

    return () => clearTimeout(timer);
  }, [globalSearchTerm, location.pathname, location.search, navigate]);

  const handleGlobalSearchSubmit = (e) => {
    e.preventDefault();
    const trimmed = globalSearchTerm.trim();
    if (trimmed) {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    } else {
      navigate("/search");
    }
  };

  // Global Ctrl+K / Cmd+K and Ctrl+B / Cmd+B shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="search"]');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        } else {
          navigate("/search");
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        const target = e.target;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        toggleSidebarCollapsed();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const handleWorkspaceSwitch = (wsId) => {
    if (wsId === activeWorkspaceId) {
      setIsWorkspaceMenuOpen(false);
      return;
    }
    if (editorDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes. Discard changes and switch workspace?"
      );
      if (!confirmed) {
        setIsWorkspaceMenuOpen(false);
        return;
      }
    }
    switchWorkspace(wsId);
    setIsWorkspaceMenuOpen(false);
  };

  const handleManageCreateSubmit = async (e) => {
    e.preventDefault();
    const trimmed = manageCreateName.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setManageCreateError("Workspace name cannot be empty.");
      return;
    }
    if (trimmed.length > WORKSPACE_LIMITS.MAX_NAME_LENGTH) {
      setManageCreateError(`Workspace name cannot exceed ${WORKSPACE_LIMITS.MAX_NAME_LENGTH} characters.`);
      return;
    }

    setIsManageCreating(true);
    setManageCreateError(null);
    try {
      await createNewWorkspace(trimmed);
      setManageCreateName("");
    } catch (err) {
      if (err.status === 409 || err.code === "WORKSPACE_CONFLICT") {
        setManageCreateError("A workspace with this name already exists.");
      } else {
        setManageCreateError(err?.message || "Failed to create workspace.");
      }
    } finally {
      setIsManageCreating(false);
    }
  };

  const handleManageRenameSubmit = async (e) => {
    e.preventDefault();
    const trimmed = manageEditingName.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setManageRenameError("Workspace name cannot be empty.");
      return;
    }
    if (trimmed.length > WORKSPACE_LIMITS.MAX_NAME_LENGTH) {
      setManageRenameError(`Workspace name cannot exceed ${WORKSPACE_LIMITS.MAX_NAME_LENGTH} characters.`);
      return;
    }

    setIsManageRenaming(true);
    setManageRenameError(null);
    try {
      await renameWorkspace(manageEditingId, trimmed);
      setManageEditingId(null);
      setManageEditingName("");
    } catch (err) {
      if (err.status === 409 || err.code === "WORKSPACE_CONFLICT") {
        setManageRenameError("A workspace with this name already exists.");
      } else {
        setManageRenameError(err?.message || "Failed to rename workspace.");
      }
    } finally {
      setIsManageRenaming(false);
    }
  };

  const handleManageSetDefault = async (id) => {
    try {
      await setAsDefault(id);
    } catch (err) {
      alert(err?.message || "Failed to set default workspace.");
    }
  };

  const handleManageDelete = async () => {
    if (!manageDeleteTarget) return;
    setIsManageDeleting(true);
    setManageDeleteError(null);
    try {
      await removeWorkspace(manageDeleteTarget.id);
      setManageDeleteTarget(null);
    } catch (err) {
      setManageDeleteError(err?.message || "Failed to delete workspace.");
    } finally {
      setIsManageDeleting(false);
    }
  };

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
    setTimeout(() => {
      menuButtonRef.current?.focus();
    }, 0);
  }, []);

  // Manage drawer focus trap, Escape key, and body scroll lock
  useEffect(() => {
    if (!isDrawerOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

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

  // Render navigation links grouped by category with optional collapsed mode
  const renderNavLinks = (onItemClick, isCollapsed = false) => (
    <nav className={`flex-1 space-y-3 ${isCollapsed ? "px-2 py-3" : "px-2.5 py-3"} overflow-y-auto`} aria-label="Main Navigation">
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="space-y-0.5">
          {!isCollapsed && (
            <h2 className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#8A94A6] mb-1">
              {group.title}
            </h2>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
                onClick={onItemClick}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `group flex items-center ${isCollapsed ? "justify-center px-2" : "gap-2.5 px-2.5"} py-2 rounded-xl text-xs font-medium transition-colors ${isActive
                    ? "active bg-[#E2E8FF] text-[#2948D8] font-semibold"
                    : "text-[#667085] hover:bg-[#F4F6FB] hover:text-[#111827]"
                  }`
                }
              >
                <NavIcon name={item.label} />
                <span className={isCollapsed ? "sr-only" : "truncate"}>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}

      {/* Collections section */}
      <div className="space-y-0.5">
        {!isCollapsed ? (
          <div className="flex items-center justify-between px-2.5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[#8A94A6]">
              Collections
            </h2>
            <button
              type="button"
              onClick={() => {
                setCreateCollectionInput("");
                setCreateCollectionError(null);
                setShowCreateCollectionModal(true);
              }}
              className="flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-medium text-[#365CF5] hover:text-[#2848D8] hover:bg-[#EEF3FF]"
              aria-label="Create collection"
              title="Create collection"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>New</span>
            </button>
          </div>
        ) : (
          <div className="my-1 border-t border-[#E1E6F0]" />
        )}
        <div className="space-y-0.5">
          {collections.length === 0 ? (
            !isCollapsed ? (
              <div className="px-2.5 py-1 text-xs text-[#8A94A6] italic">
                No collections yet
              </div>
            ) : null
          ) : (
            collections.map((col, idx) => {
              const pastelColors = [
                "text-purple-600 bg-purple-50",
                "text-rose-600 bg-rose-50",
                "text-blue-600 bg-blue-50",
                "text-amber-600 bg-amber-50",
                "text-emerald-600 bg-emerald-50",
              ];
              const colorClass = pastelColors[idx % pastelColors.length];
              return (
                <NavLink
                  key={col.id}
                  to={`/collections/${col.id}`}
                  onClick={onItemClick}
                  title={col.name}
                  className={({ isActive }) =>
                    `group flex items-center ${isCollapsed ? "justify-center px-2" : "justify-between px-2.5"} py-1.5 rounded-xl text-xs font-medium transition-colors ${isActive
                      ? "active bg-[#E2E8FF] text-[#2948D8] font-semibold"
                      : "text-[#667085] hover:bg-[#F4F6FB] hover:text-[#111827]"
                    }`
                  }
                >
                  <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-2 min-w-0"}`}>
                    <span className={`p-1 rounded-md ${colorClass} flex-shrink-0`}>
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                        />
                      </svg>
                    </span>
                    <span className={isCollapsed ? "sr-only" : "truncate"}>{col.name}</span>
                  </div>
                  {!isCollapsed && (
                    <span className="ml-2 text-[11px] text-[#8A94A6] font-normal">
                      {col.noteCount || 0}
                    </span>
                  )}
                </NavLink>
              );
            })
          )}
        </div>
      </div>

      {/* Tags section */}
      <div className="space-y-0.5">
        {!isCollapsed ? (
          <div className="flex items-center justify-between px-2.5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[#8A94A6]">
              Tags
            </h2>
            <button
              type="button"
              onClick={() => {
                setCreateTagInput("");
                setCreateTagError(null);
                setShowCreateTagModal(true);
              }}
              className="flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-medium text-[#365CF5] hover:text-[#2848D8] hover:bg-[#EEF3FF]"
              aria-label="Create tag"
              title="Create tag"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>New</span>
            </button>
          </div>
        ) : (
          <div className="my-1 border-t border-[#E1E6F0]" />
        )}
        <div className="space-y-0.5">
          {tags.length === 0 ? (
            !isCollapsed ? (
              <div className="px-2.5 py-1 text-xs text-[#8A94A6] italic">
                No tags yet
              </div>
            ) : null
          ) : (
            tags.map((tag) => (
              <NavLink
                key={tag.id}
                to={`/tags/${tag.id}`}
                onClick={onItemClick}
                title={`#${tag.name}`}
                className={({ isActive }) =>
                  `group flex items-center ${isCollapsed ? "justify-center px-2" : "justify-between px-2.5"} py-1.5 rounded-xl text-xs font-medium transition-colors ${isActive
                    ? "active bg-[#E2E8FF] text-[#2948D8] font-semibold"
                    : "text-[#667085] hover:bg-[#F4F6FB] hover:text-[#111827]"
                  }`
                }
              >
                <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-2 min-w-0"}`}>
                  <span className="text-[#365CF5] font-bold text-xs">
                    #
                  </span>
                  <span className={isCollapsed ? "sr-only" : "truncate"}>{tag.name}</span>
                </div>
                {!isCollapsed && (
                  <span className="ml-2 text-[11px] text-[#8A94A6] font-normal">
                    {tag.noteCount || 0}
                  </span>
                )}
              </NavLink>
            ))
          )}
        </div>
      </div>

      {/* Settings & Trash navigation links */}
      <div className="pt-2 border-t border-[#E1E6F0] space-y-0.5">
        <NavLink
          to="/settings"
          onClick={onItemClick}
          title={isCollapsed ? "Settings" : undefined}
          className={({ isActive }) =>
            `group flex items-center ${isCollapsed ? "justify-center px-2" : "gap-2.5 px-2.5"} py-2 rounded-xl text-xs font-medium transition-colors ${isActive
              ? "active bg-[#E2E8FF] text-[#2948D8] font-semibold"
              : "text-[#667085] hover:bg-[#F4F6FB] hover:text-[#111827]"
            }`
          }
        >
          <NavIcon name="Settings" />
          <span className={isCollapsed ? "sr-only" : ""}>Settings</span>
        </NavLink>

        <NavLink
          to="/trash"
          onClick={onItemClick}
          title={isCollapsed ? "Trash" : undefined}
          className={({ isActive }) =>
            `group flex items-center ${isCollapsed ? "justify-center px-2" : "gap-2.5 px-2.5"} py-2 rounded-xl text-xs font-medium transition-colors ${isActive
              ? "active bg-[#E2E8FF] text-[#2948D8] font-semibold"
              : "text-[#667085] hover:bg-[#F4F6FB] hover:text-[#111827]"
            }`
          }
        >
          <NavIcon name="Trash" />
          <span className={isCollapsed ? "sr-only" : ""}>Trash</span>
        </NavLink>
      </div>
    </nav>
  );

  // Render user profile area & logout action with optional collapsed mode
  const renderUserSection = (isCollapsed = false) => (
    <div className={`border-t border-[#E1E6F0] ${isCollapsed ? "p-2 flex flex-col items-center gap-2" : "p-3 space-y-2"} bg-[#FBFCFF]`}>
      {logoutError && !isCollapsed && (
        <div
          role="alert"
          className="rounded-md bg-rose-50 p-2 text-xs text-rose-800 border border-rose-200"
        >
          {logoutError}
        </div>
      )}

      {isCollapsed ? (
        <>
          <NavLink
            to="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6554D9] text-xs font-bold text-white hover:opacity-85 transition-opacity"
            title={`Account Settings (${user?.name || user?.email || "User"})`}
            aria-label="Account Settings"
          >
            {user?.name ? user.name.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : "U")}
          </NavLink>
          <button
            type="button"
            onClick={handleLogoutAttempt}
            disabled={isLoggingOut}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#DCE3EF] bg-white text-[#667085] hover:text-[#111827] hover:bg-[#F4F6FB] shadow-2xs transition-colors"
            aria-label="Log out of MyNotes"
            title={isLoggingOut ? "Signing out…" : "Log out"}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
          </button>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2.5">
          <NavLink
            to="/settings"
            className="flex items-center gap-2 min-w-0 group hover:opacity-85 transition-opacity"
            title="Account Settings"
          >
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#6554D9] text-xs font-semibold text-white"
              aria-hidden="true"
            >
              {user?.name ? user.name.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : "U")}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[#111827] group-hover:text-[#365CF5]" title={user?.name || user?.email || "User"}>
                {user?.name || user?.displayName || user?.email || "Signed in"}
              </p>
              <p className="text-[10px] text-[#8A94A6]">Settings</p>
            </div>
          </NavLink>

          <button
            type="button"
            onClick={handleLogoutAttempt}
            disabled={isLoggingOut}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-[#DCE3EF] bg-white px-2 py-1 text-xs font-medium text-[#374151] shadow-2xs hover:bg-[#F4F6FB] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-[#A5B4FC] disabled:opacity-60 transition-colors"
            aria-label="Log out of MyNotes"
          >
            {isLoggingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      )}
    </div>
  );

  // Render workspace switcher dropdown for sidebar and mobile drawer
  const renderWorkspaceSwitcher = (onSwitchCallback, isCollapsed = false) => (
    <div className={`relative border-b border-[#E1E6F0] ${isCollapsed ? "p-2 flex justify-center" : "px-3 py-2"} bg-[#FBFCFF]`}>
      <button
        type="button"
        id="workspace-switcher-btn"
        onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
        aria-expanded={isWorkspaceMenuOpen}
        aria-haspopup="listbox"
        aria-label={`Switch workspace, currently in ${activeWorkspace?.name || "Default Workspace"}`}
        title={isCollapsed ? `Workspace: ${activeWorkspace?.name || "Default Workspace"}` : undefined}
        className={
          isCollapsed
            ? "flex h-8 w-8 items-center justify-center rounded-lg border border-[#E1E6F0] bg-white text-[#667085] shadow-2xs hover:border-[#CBD5E1] hover:bg-[#F4F6FB] hover:text-[#111827] transition-colors"
            : "w-full flex items-center justify-between gap-2 rounded-xl border border-[#E1E6F0] bg-white px-2.5 py-1.5 text-left text-xs shadow-2xs hover:border-[#CBD5E1] hover:bg-[#F4F6FB] transition-colors focus-visible:outline-2 focus-visible:outline-[#A5B4FC]"
        }
      >
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-2 min-w-0"}`}>
          <svg className="h-4 w-4 flex-shrink-0 text-[#365CF5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          {!isCollapsed && (
            <div className="min-w-0 flex items-center gap-1.5">
              <span className="font-semibold text-[#111827] truncate">
                {activeWorkspace?.name || "Default Workspace"}
              </span>
              {(activeWorkspace?.isDefault || activeWorkspace?.is_default) && (
                <span className="rounded bg-[#EEF3FF] px-1 py-0.2 text-[10px] font-medium text-[#2948D8] border border-[#C7D7FE]">
                  Default
                </span>
              )}
            </div>
          )}
        </div>
        {!isCollapsed && (
          <svg className={`h-3.5 w-3.5 flex-shrink-0 text-[#8A94A6] transition-transform ${isWorkspaceMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>

      {/* Dropdown Menu */}
      {isWorkspaceMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsWorkspaceMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            role="listbox"
            aria-label="Workspaces"
            className={`absolute ${isCollapsed ? "left-14 top-2 w-56" : "left-3 right-3 top-full mt-1"} z-40 max-h-60 overflow-y-auto rounded-xl border border-[#E1E6F0] bg-white p-1.5 shadow-xl space-y-0.5`}
          >
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8A94A6]">
              Workspaces
            </div>
            {workspaces.filter((ws) => Boolean(ws && ws.id)).map((ws) => {
              const isSelected = ws.id === activeWorkspaceId;
              return (
                <button
                  key={ws.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    handleWorkspaceSwitch(ws.id);
                    if (onSwitchCallback) onSwitchCallback();
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-left transition-colors ${isSelected
                    ? "bg-[#EEF3FF] text-[#2948D8] font-semibold"
                    : "text-[#374151] hover:bg-[#F4F6FB] hover:text-[#111827]"
                    }`}
                >
                  <span className="truncate">{ws.name}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(ws.isDefault || ws.is_default) && (
                      <span className="text-[10px] text-[#8A94A6] font-normal">Default</span>
                    )}
                    {isSelected && (
                      <svg className="h-3.5 w-3.5 text-[#365CF5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}

            <div className="border-t border-[#E1E6F0] my-1 pt-1 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsWorkspaceMenuOpen(false);
                  setManageCreateName("");
                  setManageCreateError(null);
                  setShowManageWorkspacesModal(true);
                  if (onSwitchCallback) onSwitchCallback();
                }}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-[#365CF5] hover:text-[#2848D8] hover:bg-[#EEF3FF] transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>Manage Workspaces</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // Render modal for managing workspaces
  const renderManageWorkspacesModal = () => {
    if (!showManageWorkspacesModal) return null;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-workspaces-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs overflow-y-auto"
      >
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-[#E6EAF2] space-y-6 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#E6EAF2] pb-3">
            <h2 id="manage-workspaces-title" className="text-lg font-bold text-[#111827]">
              Manage Workspaces
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowManageWorkspacesModal(false);
                setManageEditingId(null);
                setManageDeleteTarget(null);
              }}
              className="rounded-lg p-1 text-[#8A94A6] hover:bg-[#F4F6FB] hover:text-[#111827]"
              aria-label="Close dialog"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Create section */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8A94A6] mb-2">
              Create Workspace
            </h3>
            <form onSubmit={handleManageCreateSubmit} className="flex gap-2">
              <input
                type="text"
                value={manageCreateName}
                onChange={(e) => {
                  setManageCreateName(e.target.value);
                  if (manageCreateError) setManageCreateError(null);
                }}
                placeholder="New workspace name"
                maxLength={WORKSPACE_LIMITS.MAX_NAME_LENGTH}
                aria-label="New workspace name"
                disabled={isManageCreating}
                className="flex-1 rounded-xl border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs text-[#111827] focus:border-[#365CF5] focus:outline-none focus:ring-2 focus:ring-[#A5B4FC]/30"
              />
              <button
                type="submit"
                disabled={isManageCreating || !manageCreateName.trim()}
                className="rounded-xl bg-[#365CF5] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2848D8] disabled:opacity-50 transition-colors"
              >
                {isManageCreating ? "Adding…" : "Add"}
              </button>
            </form>
            {manageCreateError && (
              <p className="mt-1 text-xs text-rose-600 font-medium" role="alert">
                {manageCreateError}
              </p>
            )}
          </div>

          {/* List section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8A94A6]">
              Workspaces ({workspaces.length})
            </h3>
            <div className="divide-y divide-[#E6EAF2] rounded-xl border border-[#E6EAF2]">
              {workspaces.filter((ws) => Boolean(ws && ws.id)).map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                const isDefault = Boolean(ws.isDefault || ws.is_default);
                const isEditing = manageEditingId === ws.id;
                const canDelete = !isDefault && workspaces.length > 1;

                return (
                  <div key={ws.id} className="p-3 space-y-2">
                    {isEditing ? (
                      <form onSubmit={handleManageRenameSubmit} className="flex gap-2">
                        <input
                          type="text"
                          value={manageEditingName}
                          onChange={(e) => {
                            setManageEditingName(e.target.value);
                            if (manageRenameError) setManageRenameError(null);
                          }}
                          maxLength={WORKSPACE_LIMITS.MAX_NAME_LENGTH}
                          aria-label="Rename workspace"
                          autoFocus
                          disabled={isManageRenaming}
                          className="flex-1 rounded-xl border border-[#DCE3EF] bg-white px-2.5 py-1 text-xs text-[#111827] focus:border-[#365CF5] focus:outline-none focus:ring-2 focus:ring-[#A5B4FC]/30"
                        />
                        <button
                          type="submit"
                          disabled={isManageRenaming || !manageEditingName.trim()}
                          className="rounded-xl bg-[#365CF5] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#2848D8] disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setManageEditingId(null)}
                          className="rounded-xl border border-[#E6EAF2] px-2 py-1 text-xs text-[#374151] hover:bg-[#F7F9FD]"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-[#111827] truncate">
                            {ws.name}
                          </span>
                          {isActive && (
                            <span className="rounded-lg bg-[#EEF3FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#2948D8] border border-[#C7D7FE]">
                              Active
                            </span>
                          )}
                          {isDefault && (
                            <span className="rounded-lg bg-[#F7F9FD] px-1.5 py-0.5 text-[10px] font-medium text-[#667085] border border-[#E6EAF2]">
                              Default
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {!isActive && (
                            <button
                              type="button"
                              onClick={() => handleWorkspaceSwitch(ws.id)}
                              className="rounded px-2 py-1 text-[11px] font-medium text-[#365CF5] hover:bg-[#EEF3FF]"
                            >
                              Switch
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setManageEditingId(ws.id);
                              setManageEditingName(ws.name);
                              setManageRenameError(null);
                            }}
                            className="rounded px-2 py-1 text-[11px] font-medium text-[#667085] hover:bg-[#F4F6FB]"
                          >
                            Rename
                          </button>
                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => handleManageSetDefault(ws.id)}
                              className="rounded px-2 py-1 text-[11px] font-medium text-[#667085] hover:bg-[#F4F6FB]"
                            >
                              Make Default
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                setManageDeleteTarget(ws);
                                setManageDeleteError(null);
                              }}
                              className="rounded px-2 py-1 text-[11px] font-medium text-[#D14343] hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {isEditing && manageRenameError && (
                      <p className="text-xs text-rose-600 font-medium" role="alert">
                        {manageRenameError}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delete sub-confirmation inside modal */}
          {manageDeleteTarget && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 space-y-2">
              <p className="text-xs font-semibold text-rose-900">
                Delete workspace: {manageDeleteTarget.name}?
              </p>
              <p className="text-xs text-rose-700">
                Deleting this workspace will hide all its contents. Are you sure you want to delete {manageDeleteTarget.name}?
              </p>
              {manageDeleteError && (
                <p className="text-xs text-rose-800 font-bold" role="alert">
                  {manageDeleteError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setManageDeleteTarget(null)}
                  disabled={isManageDeleting}
                  className="rounded-xl border border-[#DCE3EF] bg-white px-2.5 py-1 text-xs font-medium text-[#374151] hover:bg-[#F7F9FD]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleManageDelete}
                  disabled={isManageDeleting}
                  className="rounded-xl bg-[#D14343] px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {isManageDeleting ? "Deleting…" : "Confirm Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F4F6FB] flex flex-col md:flex-row text-[#111827] transition-colors">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-[#365CF5] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-md focus:outline-hidden"
      >
        Skip to main content
      </a>

      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-[#E1E6F0] bg-[#FBFCFF] z-20 transition-[width] duration-200 ease-in-out ${isSidebarCollapsed ? "md:w-16" : "md:w-60"}`}
        aria-label="Desktop Sidebar"
      >
        {/* Branding & Collapse Toggle */}
        <div className={`flex h-14 items-center ${isSidebarCollapsed ? "justify-center" : "justify-between"} border-b border-[#E1E6F0] px-3.5 bg-[#FBFCFF]`}>
          {!isSidebarCollapsed ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#365CF5] shadow-2xs"
                  aria-hidden="true"
                >
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="block text-sm font-bold tracking-tight text-[#111827] leading-tight">
                    MyNotes
                  </span>
                  <span className="block text-[11px] text-[#8A94A6] truncate">
                    {activeWorkspace?.name || "Personal Workspace"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar (Ctrl+B)"
                className="rounded-lg p-1.5 text-[#667085] hover:text-[#111827] hover:bg-[#F4F6FB] transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                </svg>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar (Ctrl+B)"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#365CF5] hover:bg-[#E2E8FF] shadow-2xs transition-all"
            >
              <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
          )}
        </div>

        {/* Workspace Switcher */}
        {renderWorkspaceSwitcher(null, isSidebarCollapsed)}

        {/* Grouped navigation */}
        {renderNavLinks(null, isSidebarCollapsed)}

        {/* User identity & logout */}
        {renderUserSection(isSidebarCollapsed)}
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden flex h-14 items-center justify-between border-b border-[#E6EAF2] bg-white px-4 sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#365CF5] shadow-2xs"
            aria-hidden="true"
          >
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-[#111827]">
            MyNotes
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Link
            to="/search"
            aria-label="Open search"
            className="rounded-lg border border-[#DCE3EF] bg-white p-2 text-[#667085] hover:text-[#111827] hover:bg-[#F4F6FB]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </Link>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={openDrawer}
            aria-expanded={isDrawerOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={isDrawerOpen ? "Navigation menu open" : "Open navigation menu"}
            className="rounded-lg border border-[#DCE3EF] bg-white p-2 text-[#667085] hover:text-[#111827] hover:bg-[#F4F6FB] focus-visible:outline-2 focus-visible:outline-[#A5B4FC]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
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
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity motion-reduce:transition-none"
            onClick={closeDrawer}
            aria-hidden="true"
          />

          {/* Drawer sheet */}
          <div className="fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[#FBFCFF] shadow-xl border-r border-[#E1E6F0]">
            {/* Drawer header with close button */}
            <div className="flex h-14 items-center justify-between border-b border-[#E1E6F0] px-4 bg-[#FBFCFF]">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#365CF5] text-xs font-bold shadow-2xs"
                  aria-hidden="true"
                >
                  M
                </div>
                <span className="text-sm font-bold tracking-tight text-[#111827]">
                  MyNotes
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close navigation menu"
                  className="rounded-lg p-1.5 text-[#667085] hover:bg-[#F4F6FB] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-[#A5B4FC]"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Workspace Switcher in Drawer */}
            {renderWorkspaceSwitcher(closeDrawer)}

            {/* Navigation links (closing drawer on click) */}
            {renderNavLinks(closeDrawer)}

            {/* User identity & logout */}
            {renderUserSection()}
          </div>
        </div>
      )}

      {/* Unsaved Changes Shell Logout Guard Modal */}
      {showLogoutConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <svg className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <h2 className="text-base font-semibold text-slate-900">Unsaved changes</h2>
            </div>
            <p className="text-sm text-slate-600">
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
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Stay and keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirmModal(false);
                  handleLogout();
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                Discard changes and sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Collection Modal */}
      {showCreateCollectionModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-collection-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#E6EAF2]">
            <h2 id="create-collection-modal-title" className="text-lg font-bold text-[#111827]">
              New Collection
            </h2>
            <form onSubmit={handleCreateCollectionSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="new-collection-name-input" className="block text-xs font-medium text-[#374151]">
                  Collection Name (1–80 characters)
                </label>
                <input
                  id="new-collection-name-input"
                  type="text"
                  maxLength={80}
                  autoFocus
                  placeholder="e.g. Placement Prep, DSA, Project Ideas"
                  value={createCollectionInput}
                  onChange={(e) => setCreateCollectionInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-sm text-[#111827] focus:border-[#365CF5] focus:outline-none focus:ring-2 focus:ring-[#A5B4FC]/30"
                />
              </div>

              {createCollectionError && (
                <div role="alert" className="text-xs text-rose-600">
                  {createCollectionError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingCollection}
                  onClick={() => setShowCreateCollectionModal(false)}
                  className="rounded-xl border border-[#DCE3EF] px-3.5 py-2 text-sm font-medium text-[#374151] hover:bg-[#F7F9FD]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCollection || !createCollectionInput.trim()}
                  className="rounded-xl bg-[#365CF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2848D8] disabled:opacity-50 transition-colors"
                >
                  {isSubmittingCollection ? "Creating..." : "Create Collection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Tag Modal */}
      {showCreateTagModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-tag-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#E6EAF2]">
            <h2 id="create-tag-modal-title" className="text-lg font-bold text-[#111827]">
              New Tag
            </h2>
            <form onSubmit={handleCreateTagSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="new-tag-name-input" className="block text-xs font-medium text-[#374151]">
                  Tag Name (1–{TAG_LIMITS.MAX_NAME_LENGTH} characters)
                </label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-bold text-[#8A94A6]">
                    #
                  </span>
                  <input
                    id="new-tag-name-input"
                    type="text"
                    maxLength={TAG_LIMITS.MAX_NAME_LENGTH}
                    autoFocus
                    placeholder="e.g. interview, revision, bug"
                    value={createTagInput}
                    onChange={(e) => setCreateTagInput(e.target.value)}
                    className="w-full rounded-xl border border-[#DCE3EF] bg-white pl-7 pr-3 py-2 text-sm text-[#111827] focus:border-[#365CF5] focus:outline-none focus:ring-2 focus:ring-[#A5B4FC]/30"
                  />
                </div>
              </div>

              {createTagError && (
                <div role="alert" className="text-xs text-rose-600">
                  {createTagError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingTag}
                  onClick={() => setShowCreateTagModal(false)}
                  className="rounded-xl border border-[#DCE3EF] px-3.5 py-2 text-sm font-medium text-[#374151] hover:bg-[#F7F9FD]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTag || !createTagInput.trim()}
                  className="rounded-xl bg-[#365CF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2848D8] disabled:opacity-50 transition-colors"
                >
                  {isSubmittingTag ? "Creating..." : "Create Tag"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Workspaces Modal */}
      {renderManageWorkspacesModal()}

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ease-in-out ${isSidebarCollapsed ? "md:pl-16" : "md:pl-60"}`}>
        {/* Page Top Header */}
        <header className="h-14 border-b border-[#E6EAF2] bg-white px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-10 transition-colors">
          <div className="min-w-0 flex-1 flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isSidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
              className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#DCE3EF] bg-white text-[#667085] hover:text-[#111827] hover:bg-[#F4F6FB] shadow-2xs transition-colors flex-shrink-0"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                {isSidebarCollapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                )}
              </svg>
            </button>
            <PageHeader title={metadata.title} description={metadata.description} />
          </div>

          <div className="hidden md:flex items-center gap-3 flex-shrink-0">
            {/* Global Search Bar with Ctrl+K shortcut badge */}
            <form onSubmit={handleGlobalSearchSubmit} role="search" className="relative w-64 lg:w-80">
              <div className="relative flex items-center">
                <svg
                  className="absolute left-3 h-4 w-4 text-[#8A94A6] pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="search"
                  value={globalSearchTerm}
                  onChange={(e) => setGlobalSearchTerm(e.target.value)}
                  placeholder="Search notes, tags, or collections..."
                  aria-label="Search notes, tags, or collections"
                  className="w-full rounded-xl border border-[#DCE3EF] bg-white pl-9 pr-14 py-1.5 text-xs text-[#111827] placeholder:text-[#8A94A6] hover:border-[#CBD5E1] focus:border-[#365CF5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#A5B4FC]/30 shadow-2xs transition-colors"
                />
                <kbd className="absolute right-2.5 inline-flex items-center gap-0.5 rounded border border-[#E6EAF2] bg-[#F4F6FB] px-1.5 py-0.5 text-[10px] font-semibold text-[#8A94A6] pointer-events-none select-none">
                  Ctrl K
                </kbd>
              </div>
            </form>

            {/* Notification bell icon */}
            <button
              type="button"
              className="relative rounded-xl border border-[#DCE3EF] bg-white p-2 text-[#667085] hover:text-[#111827] hover:bg-[#F4F6FB] shadow-2xs transition-colors"
              title="Notifications"
              aria-label="Notifications"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#D14343] ring-2 ring-white" />
            </button>

            {/* User Profile Pill Avatar */}
            <Link
              to="/settings"
              className="flex items-center gap-2 rounded-xl border border-[#DCE3EF] bg-white px-2 py-1 shadow-2xs hover:border-[#CBD5E1] hover:bg-[#F4F6FB] transition-colors group"
              title="Profile & Settings"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#6554D9] text-[11px] font-bold text-white shadow-2xs">
                {user?.name ? user.name.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : "U")}
              </div>
              <span className="text-xs font-semibold text-[#111827] group-hover:text-[#365CF5] max-w-[90px] truncate">
                {user?.name || user?.email?.split('@')[0] || "User"}
              </span>
              <svg className="h-3 w-3 text-[#8A94A6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </Link>
          </div>
        </header>

        {/* Consistent content container */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full max-w-7xl mx-auto px-3.5 sm:px-6 py-4 sm:py-5 focus:outline-hidden"
        >
          <Outlet context={{ insideAppLayout: true, editorDirty, setEditorDirty, setEditorSaving }} />
        </main>
      </div>
    </div>
  );
}
