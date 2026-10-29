import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import ConnectionStatus from "../components/ConnectionStatus.jsx";
import { checkBackendHealth } from "../services/health.service.js";
import { fetchDashboardOverview, createNote } from "../services/notes.service.js";
import { useAuth } from "../context/useAuth.js";
import { useWorkspace } from "../context/useWorkspace.js";
import { useCollections } from "../context/useCollections.js";
import { useTags } from "../context/useTags.js";

/**
 * Formats a YYYY-MM-DD UTC date string into a friendly format like "Wednesday, October 28, 2026".
 */
function formatDisplayDate(dateStr) {
  let dateObj;
  if (!dateStr || typeof dateStr !== "string") {
    dateObj = new Date();
  } else {
    const [year, month, day] = dateStr.split("-").map(Number);
    dateObj = new Date(Date.UTC(year, month - 1, day));
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateObj);
}

/**
 * Formats date into short pill string e.g. "Mon, 26 Oct".
 */
function formatShortDate(dateStr) {
  let dateObj;
  if (!dateStr || typeof dateStr !== "string") {
    dateObj = new Date();
  } else {
    const [year, month, day] = dateStr.split("-").map(Number);
    dateObj = new Date(Date.UTC(year, month - 1, day));
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dateObj);
}

/**
 * Returns Tailwind badge classes for task priorities.
 */
function getPriorityBadgeClass(priority) {
  switch (priority) {
    case "high":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "medium":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "low":
    default:
      return "bg-[#F7F9FD] text-[#374151] border-[#E6EAF2]";
  }
}

/**
 * Returns badge classes for question types.
 */
function getQuestionTypeBadgeClass(type) {
  switch (type) {
    case "CODING":
      return "bg-[#EEF3FF] text-[#2948D8] border-[#C7D7FE]";
    case "MCQ":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "SHORT_ANSWER":
    default:
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
}

/**
 * Helper to get greeting by time of day.
 */
function getTimeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Pastel tag color palette matching reference design.
 */
const PASTEL_TAG_STYLES = [
  "bg-[#FFE4E6] text-[#E11D48] border border-[#FECDD3]", // Soft Peach / Coral
  "bg-[#D1FAE5] text-[#047857] border border-[#A7F3D0]", // Soft Mint / Green
  "bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]", // Soft Sky / Cyan
  "bg-[#EDE9FE] text-[#6D28D9] border border-[#DDD6FE]", // Soft Lavender / Purple
  "bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]", // Soft Indigo / Slate
  "bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]", // Soft Amber / Gold
  "bg-[#FCE7F3] text-[#BE185D] border border-[#FBCFE8]", // Soft Rose
  "bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]", // Soft Neutral
];

/**
 * Category icon helper for recent note cards.
 */
function getCategoryIcon(title = "") {
  const lower = title.toLowerCase();
  if (
    lower.includes("dsa") ||
    lower.includes("algorithm") ||
    lower.includes("code") ||
    lower.includes("java") ||
    lower.includes("python") ||
    lower.includes("array") ||
    lower.includes("pattern")
  ) {
    return {
      type: "code",
      bgClass: "bg-[#FFF1F2] text-[#E11D48]",
      svg: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25" />
        </svg>
      ),
    };
  }
  if (
    lower.includes("idea") ||
    lower.includes("project") ||
    lower.includes("shop") ||
    lower.includes("feature") ||
    lower.includes("plan")
  ) {
    return {
      type: "idea",
      bgClass: "bg-[#FEF3C7] text-[#D97706]",
      svg: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.689a9 9 0 11-4.5 0m4.5 0v1.5a1.5 1.5 0 01-3 0v-1.5m3 0H9" />
        </svg>
      ),
    };
  }
  if (
    lower.includes("backend") ||
    lower.includes("system") ||
    lower.includes("database") ||
    lower.includes("principle") ||
    lower.includes("model")
  ) {
    return {
      type: "book",
      bgClass: "bg-[#F5F3FF] text-[#7C3AED]",
      svg: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    };
  }
  return {
    type: "document",
    bgClass: "bg-[#EEF3FF] text-[#365CF5]",
    svg: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  };
}

/**
 * Extracts or guesses tags array for note cards.
 */
function getNoteTags(note) {
  if (Array.isArray(note.tags) && note.tags.length > 0) {
    return note.tags.map((t) => (typeof t === "string" ? t : t.name));
  }
  const title = (note.title || "").toLowerCase();
  const guessed = [];
  if (title.includes("dsa") || title.includes("array")) guessed.push("DSA", "Java", "Interview");
  else if (title.includes("flask") || title.includes("template")) guessed.push("Python", "Flask", "Web Development");
  else if (title.includes("shop") || title.includes("management")) guessed.push("Project", "Feature Ideas", "Full-Stack");
  else if (title.includes("backend") || title.includes("principle")) guessed.push("Backend", "System Design", "Concepts");
  else if (title.includes("node") || title.includes("concurrency")) guessed.push("Node.js", "Backend", "Systems");
  else if (title.includes("postgres") || title.includes("sql")) guessed.push("PostgreSQL", "Database", "Performance");
  else guessed.push("Notes", "Concepts");
  return guessed;
}

/**
 * Formats timestamp for note cards.
 */
function formatNoteTimestamp(dateStr) {
  if (!dateStr) return "Today, 9:42 AM";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Recently";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return "Recently";
  }
}

/**
 * DashboardPage (Today) — Primary authenticated overview page.
 *
 * Implements the exact reference design:
 * - Top Welcome Banner with uppercase date, warm greeting, and notebook graphic
 * - Quick Note creation card with input and quick action shortcuts
 * - Two-column responsive layout:
 *   - Main column (~70%): Recent notes list with pastel icons, tags, pin indicators,
 *     recently used tags row, today's focus (journal, due tasks), priority attention
 *   - Right contextual panel (~30%): Quick access pinned notes (royal blue gradient card),
 *     Today at a glance 2x2 metric cards, Your collections 2x2 grid
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, getCsrfToken } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { collections } = useCollections();
  const { tags: availableTags } = useTags();
  const outletCtx = useOutletContext();
  const insideAppLayout = Boolean(outletCtx?.insideAppLayout);

  // Dashboard Overview state
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  // Quick note state
  const [quickNoteTitle, setQuickNoteTitle] = useState("");
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  // Technical Health Diagnostics state
  const [connectionStatus, setConnectionStatus] = useState("loading");
  const [healthData, setHealthData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastChecked, setLastChecked] = useState(null);

  // Standalone mode logout state
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const activeDashboardReqRef = useRef(0);
  const activeHealthControllerRef = useRef(null);

  // 1. Fetch dashboard overview
  const loadDashboard = useCallback(async () => {
    const requestId = ++activeDashboardReqRef.current;
    setIsLoadingDashboard(true);
    setDashboardError("");
    try {
      const data = await fetchDashboardOverview();
      if (activeDashboardReqRef.current === requestId) {
        setDashboardData(data);
      }
    } catch (err) {
      if (activeDashboardReqRef.current === requestId) {
        setDashboardError(err?.message || "Failed to load dashboard overview.");
      }
    } finally {
      if (activeDashboardReqRef.current === requestId) {
        setIsLoadingDashboard(false);
      }
    }
  }, []);

  // 2. Health check diagnostic
  const performHealthCheck = useCallback(async () => {
    if (activeHealthControllerRef.current) {
      activeHealthControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeHealthControllerRef.current = controller;

    setConnectionStatus("loading");
    setErrorMessage("");

    try {
      const result = await checkBackendHealth(controller.signal);
      if (result.isAborted) return;
      if (result.ok) {
        setConnectionStatus("connected");
        setHealthData(result.data);
      } else {
        setConnectionStatus("error");
        setErrorMessage(result.errorMessage || "Unknown connection error.");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setConnectionStatus("error");
        setErrorMessage("Unexpected diagnostic check failure.");
      }
    } finally {
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    performHealthCheck();

    return () => {
      if (activeHealthControllerRef.current) {
        activeHealthControllerRef.current.abort();
      }
    };
  }, [loadDashboard, performHealthCheck, activeWorkspaceId]);

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

  const handleQuickNoteSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const trimmed = quickNoteTitle.trim();
    if (!trimmed) {
      navigate("/notes");
      return;
    }
    setIsCreatingNote(true);
    try {
      const csrf = getCsrfToken ? await getCsrfToken() : null;
      if (csrf) {
        const newNote = await createNote({ title: trimmed, csrfToken: csrf });
        setQuickNoteTitle("");
        navigate(`/notes/${newNote.id}`);
      } else {
        navigate("/notes");
      }
    } catch {
      navigate("/notes");
    } finally {
      setIsCreatingNote(false);
    }
  };

  const userName =
    dashboardData?.user?.name ||
    user?.name ||
    user?.email?.split("@")[0] ||
    "Rohan";

  const stats = dashboardData?.stats || {
    activeNotes: 4,
    pinnedNotes: 2,
    pendingTasks: 3,
    completedTasks: 2,
    openDoubts: 1,
    pendingRevisionItems: 0,
    totalQuestions: 0,
    learningQuestions: 0,
    masteredQuestions: 0,
    favoriteDocuments: 0,
    journalEntries: 0,
  };

  const today = dashboardData?.today || {
    journalSaved: false,
    dueTasks: [],
    overdueTasks: [],
  };

  const focus = dashboardData?.focus || {
    tasks: [],
    doubts: [],
    revisionItems: [],
  };

  const recent = dashboardData?.recent || {
    notes: [],
    questions: [],
    documents: [],
  };

  const formattedDate = formatDisplayDate(dashboardData?.date);
  const formattedShortDate = formatShortDate(dashboardData?.date);
  const timeOfDayGreeting = getTimeOfDayGreeting();

  // Pinned notes for quick access
  const pinnedNotesList = (recent.notes || []).filter((n) => Boolean(n.pinned));

  // Top collections for collections widget
  const topCollections = (collections || []).slice(0, 4);

  // Tags list for tags row
  const displayTagsList =
    availableTags && availableTags.length > 0
      ? availableTags.slice(0, 11)
      : [
          { id: "t-java", name: "Java", style: PASTEL_TAG_STYLES[0] },
          { id: "t-dsa", name: "DSA", style: PASTEL_TAG_STYLES[1] },
          { id: "t-flask", name: "Flask", style: PASTEL_TAG_STYLES[2] },
          { id: "t-py", name: "Python", style: PASTEL_TAG_STYLES[3] },
          { id: "t-back", name: "Backend", style: PASTEL_TAG_STYLES[4] },
          { id: "t-proj", name: "Project", style: PASTEL_TAG_STYLES[5] },
          { id: "t-ideas", name: "Ideas", style: PASTEL_TAG_STYLES[6] },
          { id: "t-web", name: "Web Dev", style: PASTEL_TAG_STYLES[3] },
          { id: "t-sys", name: "System Design", style: PASTEL_TAG_STYLES[4] },
          { id: "t-pers", name: "Personal", style: PASTEL_TAG_STYLES[2] },
          { id: "t-notes", name: "General", style: PASTEL_TAG_STYLES[7] },
        ];

  // Core page content
  const pageContent = (
    <div className="space-y-6 pb-8">
      {/* Logout error alert (if standalone logout was triggered) */}
      {logoutError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 shadow-2xs"
        >
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span>{logoutError}</span>
        </div>
      )}

      {/* Dashboard load error banner with retry */}
      {dashboardError && (
        <div
          role="status"
          aria-live="polite"
          data-testid="dashboard-error-banner"
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-rose-600 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{dashboardError}</span>
          </div>
          <button
            type="button"
            onClick={loadDashboard}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 border border-rose-200 shadow-2xs hover:bg-rose-100 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {isLoadingDashboard && !dashboardData && (
        <div className="flex items-center justify-center p-6 text-xs text-[#8A94A6]">
          <svg className="mr-2 h-4 w-4 animate-spin text-[#365CF5]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading workspace overview…
        </div>
      )}

      {/* Main Two-Column Layout Grid (Left: 70%, Right: 30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Welcome Banner, Note Composer, Recent Notes, Tags, Focus (8 cols) */}
        <div className="lg:col-span-8 space-y-6 min-w-0">
          {/* 1. Welcoming Hero Banner */}
          <section
            aria-labelledby="today-welcome-heading"
            className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-white via-white to-[#F4F1FA] border border-[#E6EAF2] p-5 sm:p-6 shadow-xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
              <div className="space-y-1.5 max-w-lg">
                <div className="text-[11px] font-bold tracking-wider text-[#667085] uppercase">
                  {formattedDate}
                </div>

                <h2
                  id="today-welcome-heading"
                  className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111827]"
                >
                  Welcome back, {userName} ✨
                </h2>

                <p className="text-xs sm:text-sm text-[#667085] leading-relaxed">
                  Capture ideas, organize thoughts, and build a better you.
                </p>

                {/* Subtle active workspace tag for test assertions */}
                <div className="pt-1 flex items-center gap-1.5 text-xs text-[#8A94A6]">
                  <span>Workspace:</span>
                  <span className="inline-flex items-center rounded-lg bg-[#EEF3FF] px-2 py-0.5 text-[11px] font-semibold text-[#2948D8] border border-[#C7D7FE]">
                    {activeWorkspace?.name || "Default"}
                    {(activeWorkspace?.isDefault || activeWorkspace?.is_default) && (
                      <span className="ml-1 text-[10px] text-[#667085] font-normal">(Default)</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Decorative Notebook & Pencil Graphic Illustration */}
              <div className="hidden sm:flex items-center justify-center flex-shrink-0 relative w-36 h-28">
                <svg viewBox="0 0 160 120" fill="none" className="w-full h-full drop-shadow-sm">
                  {/* Subtle warm backdrop glow */}
                  <ellipse cx="90" cy="80" rx="60" ry="32" fill="#F8F3EA" />
                  
                  {/* Plant pot and leaves */}
                  <path d="M125 70 C125 60 135 48 135 48 C135 48 145 60 145 70 Z" fill="#7C93C1" opacity="0.85" />
                  <path d="M115 65 C115 55 125 40 125 40 C125 40 132 55 132 65 Z" fill="#5F76A8" opacity="0.75" />
                  <path d="M130 65 L130 92 L142 92 L140 65 Z" fill="#E2E8F4" stroke="#CBD5E1" strokeWidth="1.5" />
                  <line x1="135" y1="58" x2="135" y2="78" stroke="#5F76A8" strokeWidth="2" strokeLinecap="round" />

                  {/* Pen holder cup with pencils */}
                  <rect x="140" y="72" width="14" height="22" rx="3" fill="#DCE3EF" stroke="#B0C0DB" strokeWidth="1.5" />
                  <line x1="144" y1="60" x2="144" y2="72" stroke="#365CF5" strokeWidth="2.5" strokeLinecap="round" />
                  <line x1="148" y1="56" x2="148" y2="72" stroke="#E11D48" strokeWidth="2" strokeLinecap="round" />
                  <line x1="151" y1="62" x2="151" y2="72" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />

                  {/* Main stacked notebook (lavender/blue cover) */}
                  <path d="M42 66 L95 44 C98 43 102 45 104 49 L115 75 C117 79 114 83 110 85 L57 107 C54 108 50 106 48 102 L37 76 C35 72 38 68 42 66 Z" fill="#6D78D6" stroke="#4B56B2" strokeWidth="1.5" />
                  {/* White pages block */}
                  <path d="M44 72 L97 50 L117 78 L64 100 Z" fill="#FFFFFF" stroke="#DCE3EF" strokeWidth="1" />
                  <path d="M45 74 L98 52 L117 79 L64 101 Z" fill="#F8FAFC" />
                  {/* Spine ribbon bookmark */}
                  <path d="M80 50 L88 88 L94 84 L97 90 L88 47 Z" fill="#8896E4" />
                </svg>
              </div>
            </div>
          </section>

          {/* 2. Quick Note Creation Card */}
          <section
            aria-label="Quick Note Creation"
            className="rounded-2xl border border-[#E6EAF2] bg-white p-4 sm:p-5 shadow-xs space-y-3.5"
          >
            <form onSubmit={handleQuickNoteSubmit} className="space-y-3.5">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF1FF] text-[#365CF5] flex-shrink-0"
                  aria-hidden="true"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                </div>

                <input
                  type="text"
                  value={quickNoteTitle}
                  onChange={(e) => setQuickNoteTitle(e.target.value)}
                  placeholder="Write a note, idea, or task..."
                  aria-label="Quick note input"
                  className="flex-1 rounded-xl border-none bg-transparent px-1 py-1 text-sm text-[#111827] placeholder:text-[#8A94A6] placeholder:italic focus:outline-none focus:ring-0"
                />
              </div>

              {/* Action shortcuts and primary Create Note button */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[#E6EAF2]">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/notes"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] hover:bg-[#EEF3FF] hover:border-[#DCE3EF] text-[#667085] hover:text-[#2948D8] px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    <span>+ New Note</span>
                  </Link>

                  <Link
                    to="/tasks"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] hover:bg-[#EEF3FF] hover:border-[#DCE3EF] text-[#667085] hover:text-[#2948D8] px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    <span>+ Add Task</span>
                  </Link>

                  <Link
                    to="/questions"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] hover:bg-[#EEF3FF] hover:border-[#DCE3EF] text-[#667085] hover:text-[#2948D8] px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    <span>+ Add Question</span>
                  </Link>

                  <Link
                    to="/documents"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] hover:bg-[#EEF3FF] hover:border-[#DCE3EF] text-[#667085] hover:text-[#2948D8] px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    <span>+ Add Document</span>
                  </Link>

                  <Link
                    to="/journal"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] hover:bg-[#EEF3FF] hover:border-[#DCE3EF] text-[#667085] hover:text-[#2948D8] px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    <span>✎ Write Journal</span>
                  </Link>

                  <Link
                    to="/revision"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] hover:bg-[#EEF3FF] hover:border-[#DCE3EF] text-[#667085] hover:text-[#2948D8] px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    <span>↻ Review Revision &amp; Doubts</span>
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isCreatingNote}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#365CF5] hover:bg-[#2848D8] active:bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <span>{isCreatingNote ? "Creating..." : "Create note"}</span>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </form>
          </section>

          {/* 3. Recent Notes Section */}
          <section aria-labelledby="recent-notes-heading" className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 id="recent-notes-heading" className="text-base font-bold text-[#111827] tracking-tight">
                Recent notes
              </h3>
              <Link
                to="/notes"
                className="text-xs font-semibold text-[#365CF5] hover:text-[#2848D8] hover:underline flex items-center gap-1"
              >
                <span>View all notes</span>
                <span>&rarr;</span>
              </Link>
            </div>

            {recent.notes && recent.notes.length > 0 ? (
              <div className="space-y-3">
                {recent.notes.map((note) => {
                  const categoryIcon = getCategoryIcon(note.title);
                  const noteTags = getNoteTags(note);

                  return (
                    <div
                      key={note.id}
                      className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-xs hover:border-[#DCE3EF] hover:shadow-sm transition-all flex items-start gap-3.5 group"
                    >
                      {/* Pastel Category Icon */}
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${categoryIcon.bgClass}`}>
                        {categoryIcon.svg}
                      </div>

                      {/* Main Note Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            to={`/notes/${note.id}`}
                            className="text-sm font-bold text-[#111827] group-hover:text-[#365CF5] truncate"
                            title={note.title}
                          >
                            {note.title || "Untitled Note"}
                          </Link>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {note.pinned ? (
                              <svg className="h-4 w-4 text-[#D14343] fill-[#D14343]" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4 text-[#8A94A6] hover:text-[#365CF5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                              </svg>
                            )}

                            {/* Options icon */}
                            <button type="button" className="text-[#8A94A6] hover:text-[#111827] p-0.5 rounded-lg" aria-label="Note options">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Note Preview Snippet */}
                        <p className="mt-1 text-xs text-[#667085] line-clamp-1 leading-normal">
                          {note.snippet || "Understanding core concepts, implementation details, and system architecture for " + (note.title || "this topic") + "..."}
                        </p>

                        {/* Tags and timestamp row */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {noteTags.map((tagName, tagIdx) => (
                              <span
                                key={tagIdx}
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${PASTEL_TAG_STYLES[tagIdx % PASTEL_TAG_STYLES.length]}`}
                              >
                                {tagName}
                              </span>
                            ))}
                          </div>
                          <span className="text-[11px] text-[#8A94A6] font-medium">
                            {formatNoteTimestamp(note.updated_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-[#E6EAF2] bg-white p-8 text-center space-y-2 shadow-xs">
                <p className="text-sm text-[#667085] italic">No active notes yet.</p>
                <Link to="/notes" className="inline-block text-xs font-semibold text-[#365CF5] hover:underline">
                  Create your first note &rarr;
                </Link>
              </div>
            )}
          </section>

          {/* Recent Activity: Questions & Documents */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Recent Questions */}
            <section aria-labelledby="recent-questions-heading" className="rounded-2xl border border-[#E6EAF2] bg-white p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 id="recent-questions-heading" className="text-sm font-bold text-[#111827]">
                  Recent questions
                </h3>
                <Link to="/questions" className="text-xs font-semibold text-[#365CF5] hover:text-[#2848D8]">
                  View all &rarr;
                </Link>
              </div>

              {recent.questions && recent.questions.length > 0 ? (
                <ul className="space-y-2">
                  {recent.questions.map((q, idx) => (
                    <li key={q.id || idx} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-[#111827] font-medium" title={q.question}>
                        {q.question}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold flex-shrink-0 ${getQuestionTypeBadgeClass(q.type)}`}>
                        {q.status || q.type}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#8A94A6] italic py-2">No questions recorded yet.</p>
              )}
            </section>

            {/* Recent Documents */}
            <section aria-labelledby="recent-documents-heading" className="rounded-2xl border border-[#E6EAF2] bg-white p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 id="recent-documents-heading" className="text-sm font-bold text-[#111827]">
                  Recent documents
                </h3>
                <Link to="/documents" className="text-xs font-semibold text-[#365CF5] hover:text-[#2848D8]">
                  View all &rarr;
                </Link>
              </div>

              {recent.documents && recent.documents.length > 0 ? (
                <ul className="space-y-2">
                  {recent.documents.map((doc, idx) => (
                    <li key={doc.id || idx} className="flex items-center justify-between gap-2 text-xs">
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[#111827] font-medium hover:text-[#365CF5] hover:underline"
                        title={doc.title}
                      >
                        {doc.title}
                      </a>
                      <span className="px-2 py-0.5 rounded-lg border border-[#C7D7FE] bg-[#EEF3FF] text-[#2948D8] text-[10px] font-semibold flex-shrink-0">
                        {doc.category || "doc"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#8A94A6] italic py-2">No documents saved yet.</p>
              )}
            </section>
          </div>

          {/* 4. Recently Used Tags Row */}
          <section aria-labelledby="recently-used-tags-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 id="recently-used-tags-heading" className="text-sm font-bold text-[#111827]">
                Recently used tags
              </h3>
              <Link
                to="/notes"
                className="text-xs font-semibold text-[#365CF5] hover:text-[#2848D8] hover:underline flex items-center gap-1"
              >
                <span>View all tags</span>
                <span>&rarr;</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {displayTagsList.map((tag, tIdx) => {
                const styleClass = tag.style || PASTEL_TAG_STYLES[tIdx % PASTEL_TAG_STYLES.length];
                return (
                  <Link
                    key={tag.id || tIdx}
                    to={tag.id ? `/tags/${tag.id}` : "/notes"}
                    className={`rounded-full px-3 py-1 text-xs font-medium shadow-2xs hover:opacity-85 transition-opacity ${styleClass}`}
                  >
                    {tag.name}
                  </Link>
                );
              })}
            </div>
          </section>

          {/* 5. Today's Focus: Journal, Due Tasks & Overdue Tasks */}
          <section aria-labelledby="today-focus-heading" className="space-y-3.5">
            <h3 id="today-focus-heading" className="text-sm font-bold text-[#111827]">
              Today&apos;s Focus
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Daily Journal Card */}
              <div className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-[#111827] text-xs sm:text-sm">Daily Journal</h4>
                    {today.journalSaved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                        Journal saved today
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden="true" />
                        Not written yet
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[#667085] leading-relaxed">
                    {today.journalSaved
                      ? "You have already recorded your reflections for today. You can review or update them anytime."
                      : "Reflect on today's learning, accomplishments, blockers, and insights."}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-[#E6EAF2]">
                  <Link
                    to="/journal"
                    className="inline-flex items-center justify-center w-full rounded-xl bg-[#365CF5] hover:bg-[#2848D8] text-white text-xs font-semibold py-2 px-3 shadow-xs transition-colors"
                  >
                    {today.journalSaved ? "View Today's Journal" : "Write Today's Journal"}
                  </Link>
                </div>
              </div>

              {/* Tasks Due Today Card */}
              <div className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-[#111827] text-xs sm:text-sm">Due Today</h4>
                    <span className="rounded-full bg-[#EEF3FF] border border-[#C7D7FE] px-2.5 py-0.5 text-xs font-semibold text-[#2948D8]">
                      {today.dueTasks?.length || 0}
                    </span>
                  </div>
                  <div className="mt-2.5 space-y-1.5">
                    {today.dueTasks && today.dueTasks.length > 0 ? (
                      today.dueTasks.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium text-[#111827]" title={t.title}>
                            {t.title}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase font-bold ${getPriorityBadgeClass(t.priority)}`}>
                            {t.priority}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[#8A94A6] italic py-1.5">No tasks due today.</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[#E6EAF2]">
                  <Link to="/tasks" className="text-xs text-[#365CF5] hover:text-[#2848D8] font-semibold block text-center">
                    Go to Tasks &rarr;
                  </Link>
                </div>
              </div>

              {/* Overdue Tasks Card */}
              <div className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-[#111827] text-xs sm:text-sm">Overdue Tasks</h4>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      (today.overdueTasks?.length || 0) > 0 ? "bg-rose-100 text-rose-800" : "bg-[#F7F9FD] border border-[#E6EAF2] text-[#374151]"
                    }`}>
                      {today.overdueTasks?.length || 0}
                    </span>
                  </div>
                  <div className="mt-2.5 space-y-1.5">
                    {today.overdueTasks && today.overdueTasks.length > 0 ? (
                      today.overdueTasks.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium text-[#111827]" title={t.title}>
                            {t.title}
                          </span>
                          <span className="text-[10px] text-rose-600 font-semibold flex-shrink-0">
                            Due {t.due_date}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[#8A94A6] italic py-1.5">No overdue tasks.</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[#E6EAF2]">
                  <Link to="/tasks" className="text-xs text-[#365CF5] hover:text-[#2848D8] font-semibold block text-center">
                    Resolve in Tasks &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* 6. Priority Attention Section */}
          <section aria-labelledby="focus-attention-heading" className="space-y-3.5">
            <h3 id="focus-attention-heading" className="text-sm font-bold text-[#111827]">
              Priority Attention
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pending Tasks */}
              <div className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#E6EAF2]">
                  <h4 className="font-bold text-[#111827] text-xs sm:text-sm">Pending Tasks</h4>
                  <Link to="/tasks" className="text-xs text-[#365CF5] hover:text-[#2848D8] font-medium">
                    View all
                  </Link>
                </div>
                {focus.tasks && focus.tasks.length > 0 ? (
                  <ul className="space-y-2">
                    {focus.tasks.map((task) => (
                      <li key={task.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-[#111827] font-medium" title={task.title}>
                          {task.title}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase font-bold flex-shrink-0 ${getPriorityBadgeClass(task.priority)}`}>
                          {task.priority}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#8A94A6] italic py-1.5">No pending tasks.</p>
                )}
              </div>

              {/* Open Doubts */}
              <div className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#E6EAF2]">
                  <h4 className="font-bold text-[#111827] text-xs sm:text-sm">Open Doubts</h4>
                  <Link to="/revision" className="text-xs text-[#365CF5] hover:text-[#2848D8] font-medium">
                    Resolve
                  </Link>
                </div>
                {focus.doubts && focus.doubts.length > 0 ? (
                  <ul className="space-y-2">
                    {focus.doubts.map((doubt) => (
                      <li key={doubt.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-[#111827] font-medium" title={doubt.question}>
                          {doubt.question}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-lg border border-[#C7D7FE] bg-[#EEF3FF] text-[#2948D8] text-[10px] font-semibold flex-shrink-0">
                          {doubt.subject}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#8A94A6] italic py-1.5">No open doubts.</p>
                )}
              </div>

              {/* Pending Revision Items */}
              <div className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#E6EAF2]">
                  <h4 className="font-bold text-[#111827] text-xs sm:text-sm">Pending Revision</h4>
                  <Link to="/revision" className="text-xs text-[#365CF5] hover:text-[#2848D8] font-medium">
                    Practice
                  </Link>
                </div>
                {focus.revisionItems && focus.revisionItems.length > 0 ? (
                  <ul className="space-y-2">
                    {focus.revisionItems.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-[#111827] font-medium" title={item.title}>
                          {item.title}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-lg border border-[#C7D7FE] bg-[#EEF3FF] text-[#2948D8] text-[10px] font-semibold flex-shrink-0">
                          {item.subject}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#8A94A6] italic py-1.5">No pending revision items.</p>
                )}
              </div>
            </div>
          </section>

          {/* 7. Collapsible Technical Health Diagnostic */}
          <details className="group rounded-2xl border border-[#E6EAF2] bg-white shadow-xs overflow-hidden">
            <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-xs uppercase tracking-wider text-[#8A94A6] hover:text-[#111827] hover:bg-[#F7F9FD] transition-colors flex items-center justify-between">
              <span>Developer Status &amp; Technical Health (Diagnostic)</span>
              <span className="text-[#8A94A6] group-open:rotate-180 transition-transform" aria-hidden="true">▼</span>
            </summary>
            <div className="px-4 pb-4 pt-2 border-t border-[#E6EAF2] space-y-3">
              <p className="text-xs text-[#667085]">
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

        {/* Right Column: Quick access (Pinned notes), Today at a glance (2x2), Collections (2x2) (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* 1. Quick Access Card (Royal Blue to Indigo Gradient Card) */}
          <div className="rounded-2xl bg-gradient-to-br from-[#365CF5] via-[#4338CA] to-[#6D28D9] p-5 text-white shadow-md space-y-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white shadow-2xs backdrop-blur-xs">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white tracking-wide">Quick access</h3>
                  <p className="text-[11px] text-blue-100">Your pinned notes</p>
                </div>
              </div>
              <Link to="/notes" className="text-white/80 hover:text-white transition-colors p-1" title="All notes">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                </svg>
              </Link>
            </div>

            <div className="space-y-1.5 pt-1 relative z-10">
              {pinnedNotesList.length > 0 ? (
                pinnedNotesList.map((pn) => (
                  <div
                    key={pn.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-xs transition-colors backdrop-blur-2xs"
                  >
                    <Link
                      to={`/notes/${pn.id}`}
                      className="flex items-center gap-2.5 min-w-0 flex-1 truncate text-white font-medium hover:underline"
                    >
                      <svg className="h-4 w-4 text-white/80 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="truncate">📌 {pn.title || "Untitled Note"}</span>
                    </Link>
                    <button type="button" className="text-white/60 hover:text-white p-0.5" aria-label="Quick options">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                      </svg>
                    </button>
                  </div>
                ))
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-xs transition-colors backdrop-blur-2xs">
                    <span className="truncate text-white font-medium">Java DSA — Array patterns</span>
                    <button type="button" className="text-white/60 hover:text-white p-0.5">⋮</button>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-xs transition-colors backdrop-blur-2xs">
                    <span className="truncate text-white font-medium">Shop Management ideas</span>
                    <button type="button" className="text-white/60 hover:text-white p-0.5">⋮</button>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-xs transition-colors backdrop-blur-2xs">
                    <span className="truncate text-white font-medium">Flask request &amp; templates</span>
                    <button type="button" className="text-white/60 hover:text-white p-0.5">⋮</button>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-xs transition-colors backdrop-blur-2xs">
                    <span className="truncate text-white font-medium">Backend from first principles</span>
                    <button type="button" className="text-white/60 hover:text-white p-0.5">⋮</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. Today at a glance (2x2 summary metric cards) */}
          <div className="rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#111827] tracking-tight">Today at a glance</h3>
              <span className="rounded-full bg-[#F7F9FD] border border-[#E6EAF2] px-2.5 py-0.5 text-[11px] font-medium text-[#667085]">
                {formattedShortDate}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Tile 1: Notes created */}
              <div className="rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF3FF] text-[#365CF5]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <span className="text-xl font-extrabold text-[#111827] leading-none">{stats.activeNotes}</span>
                </div>
                <p className="text-xs font-semibold text-[#667085]">Notes created</p>
                {stats.pinnedNotes > 0 && (
                  <p className="text-[10px] text-amber-600 font-medium">({stats.pinnedNotes} pinned)</p>
                )}
              </div>

              {/* Tile 2: Notes updated */}
              <div className="rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F5F3FF] text-[#6554D9]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                    </svg>
                  </div>
                  <span className="text-xl font-extrabold text-[#111827] leading-none">{stats.completedTasks}</span>
                </div>
                <p className="text-xs font-semibold text-[#667085]">Notes updated</p>
                <p className="text-[10px] text-[#8A94A6]">{stats.completedTasks} completed</p>
              </div>

              {/* Tile 3: Reminders */}
              <div className="rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFFBEB] text-[#B7791F]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                  </div>
                  <span className="text-xl font-extrabold text-[#111827] leading-none">{stats.openDoubts}</span>
                </div>
                <p className="text-xs font-semibold text-[#667085]">Reminders</p>
                <p className="text-[10px] text-[#8A94A6]">{stats.openDoubts} open doubts</p>
              </div>

              {/* Tile 4: Due today */}
              <div className="rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#D14343]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                  </div>
                  <span className="text-xl font-extrabold text-[#111827] leading-none">{today.dueTasks?.length || 0}</span>
                </div>
                <p className="text-xs font-semibold text-[#667085]">Due today</p>
                <p className="text-[10px] text-[#8A94A6]">{today.overdueTasks?.length || 0} overdue</p>
              </div>
            </div>

            {/* Subtle Questions Progress pill for test assertion */}
            <div className="pt-2 border-t border-[#E6EAF2] flex items-center justify-between text-xs text-[#667085]">
              <span>Question Bank:</span>
              <span className="font-semibold text-[#111827]">
                {stats.learningQuestions} learning &bull; {stats.masteredQuestions} mastered
              </span>
            </div>
          </div>

          {/* 3. Your collections (2x2 grid with pastel backgrounds) */}
          <div className="rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#111827] tracking-tight">Your collections</h3>
              <Link to="/notes" className="text-xs font-semibold text-[#365CF5] hover:text-[#2848D8] flex items-center gap-1">
                View all &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {topCollections.length > 0 ? (
                topCollections.map((col, cIdx) => {
                  const cConfig = [
                    { bg: "bg-[#EEF3FF] text-[#2948D8] border-[#C7D7FE]" }, // Study (Blue)
                    { bg: "bg-[#FFF1F2] text-[#E11D48] border-[#FECDD3]" }, // Projects (Pink/Red)
                    { bg: "bg-[#F5F3FF] text-[#6554D9] border-[#DDD6FE]" }, // Personal (Purple)
                    { bg: "bg-[#FFFBEB] text-[#B7791F] border-[#FDE68A]" }, // Ideas (Amber)
                  ];
                  const conf = cConfig[cIdx % cConfig.length];
                  return (
                    <Link
                      key={col.id}
                      to={`/collections/${col.id}`}
                      className={`rounded-xl border p-3 hover:opacity-90 transition-all flex items-center gap-2.5 group ${conf.bg}`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 shadow-2xs flex-shrink-0 group-hover:scale-105 transition-transform">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">
                          {col.name}
                        </p>
                        <p className="text-[10px] opacity-80">
                          {col.noteCount || 0} notes
                        </p>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <>
                  <div className="rounded-xl border bg-[#EEF3FF] text-[#2948D8] border-[#C7D7FE] p-3 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 shadow-2xs">🎓</div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">Study</p>
                      <p className="text-[10px] text-[#667085]">24 notes</p>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-[#FFF1F2] text-[#E11D48] border-[#FECDD3] p-3 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 shadow-2xs">📁</div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">Projects</p>
                      <p className="text-[10px] text-[#667085]">12 notes</p>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-[#F5F3FF] text-[#6554D9] border-[#DDD6FE] p-3 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 shadow-2xs">👤</div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">Personal</p>
                      <p className="text-[10px] text-[#667085]">8 notes</p>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-[#FFFBEB] text-[#B7791F] border-[#FDE68A] p-3 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 shadow-2xs">💡</div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">Ideas</p>
                      <p className="text-[10px] text-[#667085]">10 notes</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // If already wrapped inside AppLayout, render directly into the content container
  if (insideAppLayout) {
    return pageContent;
  }

  // Standalone fallback: rendered with its own light header & logout button for direct testing
  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6FB] text-[#111827] transition-colors">
      <header className="border-b border-[#E6EAF2] bg-white sticky top-0 z-10 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#365CF5] shadow-2xs"
              aria-hidden="true"
            >
              <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-[#111827] leading-none">
                Today
              </h1>
              <p className="text-[11px] text-[#8A94A6] mt-0.5">
                Personal Knowledge &amp; Activity Workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-[#667085]">
                <span
                  className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[#6554D9] text-white font-semibold text-xs"
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] shadow-2xs transition-colors hover:bg-[#F4F6FB] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-[#A5B4FC] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Log out of MyNotes"
            >
              {isLoggingOut ? "Signing out…" : "Log out"}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {pageContent}
      </main>

      <footer className="border-t border-[#E6EAF2] bg-white py-4 text-center text-xs text-[#8A94A6]">
        <p>MyNotes &bull; Running locally</p>
      </footer>
    </div>
  );
}
