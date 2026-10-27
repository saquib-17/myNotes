import { useState, useEffect, useRef, useCallback, useContext } from "react";
import {
  useBlocker,
  UNSAFE_DataRouterContext,
} from "react-router-dom";
import { useAuth } from "../context/useAuth.js";
import {
  fetchJournalEntries,
  fetchJournalEntryByDate,
  saveJournalEntry,
  deleteJournalEntry,
  JOURNAL_LIMITS,
} from "../services/notes.service.js";
import EmptyState from "../components/EmptyState.jsx";

const HISTORY_PAGE_SIZE = 10;

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    const date = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
      weekday: "short",
    }).format(date);
  } catch {
    return dateStr;
  }
}

function formatTimestamp(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return null;
  }
}

/**
 * Inner router blocker that conditionally invokes useBlocker in a Data Router context.
 */
function DataRouterBlocker({ shouldBlock, onBlockerStateChange }) {
  const blocker = useBlocker(shouldBlock);
  useEffect(() => {
    onBlockerStateChange(blocker);
  }, [blocker, onBlockerStateChange]);
  return null;
}

/**
 * Safe blocker bridge avoiding useBlocker crash in non-data-router environments.
 */
function SafeRouterBlocker({ shouldBlock, onBlockerStateChange }) {
  const hasDataRouter = useContext(UNSAFE_DataRouterContext) !== null;
  if (!hasDataRouter) return null;
  return (
    <DataRouterBlocker
      shouldBlock={shouldBlock}
      onBlockerStateChange={onBlockerStateChange}
    />
  );
}

/**
 * JournalPage - Daily personal journal writing, history, search, and date-range filtering.
 * Enforces one entry per calendar date, explicit manual saving (Save or Ctrl+S),
 * unsaved-edits navigation protection, soft-delete, and instant recreation.
 */
export default function JournalPage() {
  const { getCsrfToken } = useAuth();
  const todayStr = getTodayString();

  // Active Editor State
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [content, setContent] = useState("");
  const [baselineContent, setBaselineContent] = useState("");
  const [existingEntry, setExistingEntry] = useState(null); // Loaded entry from server
  const [isLoadingEntry, setIsLoadingEntry] = useState(true);
  const [entryLoadError, setEntryLoadError] = useState(null);

  // Save Status: 'clean' | 'unsaved' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState("clean");
  const [saveError, setSaveError] = useState(null);

  // Unsaved Changes & Navigation Guard
  const isDirty = content !== baselineContent;
  const isSaving = saveStatus === "saving";
  const shouldBlockNav = isDirty && !isSaving;
  const [routerBlocker, setRouterBlocker] = useState(null);
  const isNavBlocked = routerBlocker?.state === "blocked";

  // Date switch confirmation modal
  const [pendingSwitchDate, setPendingSwitchDate] = useState(null);

  // Soft-Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Journal History List State
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);

  // History Search & Date Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Refs for stale request guards
  const entryFetchGenRef = useRef(0);
  const historyFetchGenRef = useRef(0);

  // ──────────────────────────────────────────────────────────────────────────
  // Search Debouncing (300ms)
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setHistoryOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ──────────────────────────────────────────────────────────────────────────
  // BeforeUnload Warning
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // ──────────────────────────────────────────────────────────────────────────
  // Load Entry for Selected Date
  // ──────────────────────────────────────────────────────────────────────────
  const loadEntryForDate = useCallback(
    async (date, signal) => {
      const currentGen = ++entryFetchGenRef.current;
      setIsLoadingEntry(true);
      setEntryLoadError(null);
      setSaveError(null);

      try {
        const entry = await fetchJournalEntryByDate(date, signal);
        if (currentGen === entryFetchGenRef.current) {
          if (entry) {
            setExistingEntry(entry);
            setContent(entry.content || "");
            setBaselineContent(entry.content || "");
          } else {
            setExistingEntry(null);
            setContent("");
            setBaselineContent("");
          }
          setSaveStatus("clean");
          setIsLoadingEntry(false);
        }
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) return;
        if (currentGen === entryFetchGenRef.current) {
          setEntryLoadError(err.message || "Failed to load journal entry.");
          setIsLoadingEntry(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    loadEntryForDate(selectedDate, controller.signal);
    return () => controller.abort();
  }, [selectedDate, loadEntryForDate]);

  // ──────────────────────────────────────────────────────────────────────────
  // Load History Entries
  // ──────────────────────────────────────────────────────────────────────────
  const loadHistory = useCallback(
    async (signal) => {
      const currentGen = ++historyFetchGenRef.current;
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const params = {
          limit: HISTORY_PAGE_SIZE,
          offset: historyOffset,
        };
        if (filterFrom) params.from = filterFrom;
        if (filterTo) params.to = filterTo;
        if (debouncedQuery) params.q = debouncedQuery;

        const data = await fetchJournalEntries(params, signal);
        if (currentGen === historyFetchGenRef.current) {
          setHistoryEntries(data.entries || []);
          setHistoryTotal(data.total || 0);
          setHistoryHasMore(Boolean(data.hasMore || data.has_more));
          setHistoryLoading(false);
        }
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) return;
        if (currentGen === historyFetchGenRef.current) {
          setHistoryError(err.message || "Failed to load journal history.");
          setHistoryLoading(false);
        }
      }
    },
    [historyOffset, filterFrom, filterTo, debouncedQuery]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  // ──────────────────────────────────────────────────────────────────────────
  // Date Change Handler (with dirty warning)
  // ──────────────────────────────────────────────────────────────────────────
  const handleDateChangeRequest = (newDate) => {
    if (!newDate || newDate === selectedDate) return;
    if (isDirty) {
      setPendingSwitchDate(newDate);
    } else {
      setSelectedDate(newDate);
    }
  };

  const confirmDateSwitch = () => {
    if (pendingSwitchDate) {
      setSelectedDate(pendingSwitchDate);
      setPendingSwitchDate(null);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Content Change Handler
  // ──────────────────────────────────────────────────────────────────────────
  const handleContentChange = (e) => {
    const newText = e.target.value;
    setContent(newText);
    if (newText !== baselineContent) {
      setSaveStatus("unsaved");
    } else {
      setSaveStatus("clean");
    }
    setSaveError(null);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Save Action (Manual Save & Ctrl+S / Cmd+S)
  // ──────────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (isSaving || !isDirty) return;
    setSaveStatus("saving");
    setSaveError(null);

    try {
      const csrf = await getCsrfToken();
      const result = await saveJournalEntry(
        selectedDate,
        { content },
        csrf
      );

      const savedEntry = result.entry || result;
      setExistingEntry(savedEntry);
      setBaselineContent(content);
      setSaveStatus("saved");

      // Refresh history list silently
      loadHistory();
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err.message || "Failed to save journal entry.");
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Soft-Delete Handler
  // ──────────────────────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!existingEntry) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const csrf = await getCsrfToken();
      await deleteJournalEntry(selectedDate, csrf);

      setShowDeleteModal(false);
      setExistingEntry(null);
      setContent("");
      setBaselineContent("");
      setSaveStatus("clean");

      // Refresh history list
      loadHistory();
    } catch (err) {
      setDeleteError(err.message || "Failed to delete journal entry.");
    } finally {
      setIsDeleting(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Navigation Blocker Handlers
  // ──────────────────────────────────────────────────────────────────────────
  const handleStayOnPage = () => {
    if (routerBlocker?.reset) {
      routerBlocker.reset();
    }
  };

  const handleDiscardAndLeave = () => {
    if (routerBlocker?.proceed) {
      routerBlocker.proceed();
    }
  };

  return (
    <div className="space-y-6">
      {/* Safe router navigation blocker */}
      <SafeRouterBlocker
        shouldBlock={shouldBlockNav}
        onBlockerStateChange={setRouterBlocker}
      />

      {/* Page Header / Subtitle required by tests */}
      <div className="border-b border-stone-200 pb-4">
        <p className="text-sm text-stone-600">Reflect and write daily journal entries.</p>
        <p className="text-xs text-stone-400 mt-0.5">
          Capture your thoughts, daily learnings, and insights. One entry per calendar date.
        </p>
      </div>

      {/* Main Layout Grid: Left (Editor) & Right (History & Search) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ──────────────────────────────────────────────────────────────── */}
        {/* LEFT COLUMN: ACTIVE ENTRY EDITOR                                */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <section className="lg:col-span-7 space-y-4" aria-label="Journal Editor">
          {/* Date Selector & Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-stone-50 border border-stone-200 rounded-xl">
            <div className="flex items-center gap-2">
              <label htmlFor="journal-date-input" className="text-xs font-semibold text-stone-700">
                Date:
              </label>
              <input
                id="journal-date-input"
                type="date"
                value={selectedDate}
                max={todayStr}
                onChange={(e) => handleDateChangeRequest(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-lg text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
              {selectedDate !== todayStr && (
                <button
                  type="button"
                  onClick={() => handleDateChangeRequest(todayStr)}
                  className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                >
                  Today
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Status Badge */}
              {saveStatus === "saving" && (
                <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving...
                </span>
              )}
              {saveStatus === "unsaved" && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Unsaved changes
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Saved
                </span>
              )}
              {saveStatus === "error" && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                  Save failed
                </span>
              )}

              {/* Save Button */}
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !isDirty}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {isSaving ? "Saving..." : "Save Entry"}
              </button>

              {/* Delete Button (if entry exists on server) */}
              {existingEntry && (
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  aria-label="Delete entry"
                  title="Delete this entry"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Date Label Header */}
          <div className="flex items-center justify-between text-xs text-stone-500 px-1">
            <span className="font-medium text-stone-800">
              Entry for {formatDateDisplay(selectedDate)}
            </span>
            <span>Ctrl+S / Cmd+S to save</span>
          </div>

          {/* Save Error Notice */}
          {saveError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between"
            >
              <span>{saveError}</span>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="text-red-500 hover:text-red-700 font-semibold uppercase text-[10px]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Entry Load Error */}
          {entryLoadError && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              {entryLoadError}
            </div>
          )}

          {/* Large Entry Textarea */}
          <div className="relative bg-white border border-stone-200 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent">
            {isLoadingEntry ? (
              <div className="h-96 flex items-center justify-center text-sm text-stone-400">
                Loading entry for {selectedDate}...
              </div>
            ) : (
              <>
                <label htmlFor="journal-textarea" className="sr-only">
                  Journal Entry Content
                </label>
                <textarea
                  id="journal-textarea"
                  rows={16}
                  value={content}
                  onChange={handleContentChange}
                  maxLength={JOURNAL_LIMITS.MAX_CONTENT_LENGTH}
                  placeholder="What did you learn today? What went well, what challenged you, and what are your thoughts for tomorrow?..."
                  className="w-full p-4 text-sm text-stone-900 placeholder-stone-400 border-0 rounded-xl focus:outline-none resize-y leading-relaxed font-sans"
                />
                <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2 bg-stone-50/50 rounded-b-xl text-[11px] text-stone-400">
                  <span>
                    {existingEntry && existingEntry.updated_at ? (
                      `Last updated: ${formatTimestamp(existingEntry.updated_at)}`
                    ) : (
                      "New uncommitted entry"
                    )}
                  </span>
                  <span>
                    {content.length} / {JOURNAL_LIMITS.MAX_CONTENT_LENGTH} chars
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────── */}
        {/* RIGHT COLUMN: JOURNAL HISTORY & SEARCH                          */}
        {/* ──────────────────────────────────────────────────────────────── */}
        <section className="lg:col-span-5 space-y-4" aria-label="Journal History">
          <div className="p-4 bg-white border border-stone-200 rounded-xl shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-stone-900 flex items-center justify-between">
              <span>Journal History</span>
              <span className="text-xs font-normal text-stone-500">
                {historyTotal} {historyTotal === 1 ? "entry" : "entries"}
              </span>
            </h2>

            {/* Search Input */}
            <div className="relative">
              <label htmlFor="journal-search-input" className="sr-only">
                Search journal entries
              </label>
              <input
                id="journal-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reflections & notes..."
                className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1.5 text-stone-400 hover:text-stone-600 text-xs"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* Date Range Filters */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-100">
              <div>
                <label htmlFor="filter-from" className="block text-[10px] font-medium text-stone-500 mb-0.5">
                  From:
                </label>
                <input
                  id="filter-from"
                  type="date"
                  value={filterFrom}
                  max={todayStr}
                  onChange={(e) => {
                    setFilterFrom(e.target.value);
                    setHistoryOffset(0);
                  }}
                  className="w-full px-2 py-1 text-xs bg-stone-50 border border-stone-200 rounded-md text-stone-700"
                />
              </div>
              <div>
                <label htmlFor="filter-to" className="block text-[10px] font-medium text-stone-500 mb-0.5">
                  To:
                </label>
                <input
                  id="filter-to"
                  type="date"
                  value={filterTo}
                  max={todayStr}
                  onChange={(e) => {
                    setFilterTo(e.target.value);
                    setHistoryOffset(0);
                  }}
                  className="w-full px-2 py-1 text-xs bg-stone-50 border border-stone-200 rounded-md text-stone-700"
                />
              </div>
            </div>

            {(filterFrom || filterTo || searchQuery) && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setFilterFrom("");
                    setFilterTo("");
                    setSearchQuery("");
                    setHistoryOffset(0);
                  }}
                  className="text-[11px] text-emerald-700 hover:text-emerald-900 font-medium"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>

          {/* History List Entries */}
          {historyLoading ? (
            <div className="p-8 text-center text-xs text-stone-500 bg-white border border-stone-200 rounded-xl">
              Loading entries...
            </div>
          ) : historyError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center text-xs text-red-700">
              {historyError}
            </div>
          ) : historyEntries.length === 0 ? (
            <EmptyState
              title={
                debouncedQuery
                  ? "No entries match your search"
                  : filterFrom || filterTo
                  ? "No entries in this date range"
                  : "No journal entries yet"
              }
              description={
                debouncedQuery || filterFrom || filterTo
                  ? "Try adjusting your query or date range."
                  : "Write your first daily reflection on the left."
              }
              icon={
                <svg className="w-8 h-8 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              }
            />
          ) : (
            <div className="space-y-2">
              {historyEntries.map((entry) => {
                const isCurrent = entry.entry_date === selectedDate;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleDateChangeRequest(entry.entry_date)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isCurrent
                        ? "bg-emerald-50/70 border-emerald-300 shadow-sm ring-1 ring-emerald-400"
                        : "bg-white border-stone-200 hover:border-stone-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-stone-900">
                        {formatDateDisplay(entry.entry_date)}
                      </span>
                      {entry.entry_date === todayStr && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          Today
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                      {entry.content || <span className="italic text-stone-400">Empty entry</span>}
                    </p>
                    <div className="text-[10px] text-stone-400 mt-2">
                      Updated {formatTimestamp(entry.updated_at)}
                    </div>
                  </button>
                );
              })}

              {/* History Pagination */}
              {historyTotal > HISTORY_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-2 px-1 text-xs text-stone-500">
                  <span>
                    Showing {historyOffset + 1}-{Math.min(historyOffset + HISTORY_PAGE_SIZE, historyTotal)} of {historyTotal}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={historyOffset === 0}
                      onClick={() => setHistoryOffset((prev) => Math.max(0, prev - HISTORY_PAGE_SIZE))}
                      className="px-2.5 py-1 rounded border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={!historyHasMore}
                      onClick={() => setHistoryOffset((prev) => prev + HISTORY_PAGE_SIZE)}
                      className="px-2.5 py-1 rounded border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* MODAL: UNSAVED CHANGES ON NAVIGATION                                 */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {isNavBlocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="nav-guard-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <h2 id="nav-guard-title" className="text-base font-semibold text-stone-900">
                Unsaved changes
              </h2>
            </div>
            <p className="text-sm text-stone-600">
              You have unsaved changes in your journal entry for {formatDateDisplay(selectedDate)}. If you leave now, your changes will be discarded.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleStayOnPage}
                className="px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-lg border border-stone-300"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={handleDiscardAndLeave}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm"
              >
                Discard changes and leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* MODAL: UNSAVED CHANGES ON DATE SWITCH                                */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {pendingSwitchDate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="switch-guard-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <h2 id="switch-guard-title" className="text-base font-semibold text-stone-900">
              Discard edits and switch date?
            </h2>
            <p className="text-sm text-stone-600">
              You have unsaved changes for {formatDateDisplay(selectedDate)}. Switching to {formatDateDisplay(pendingSwitchDate)} will discard your current edits.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingSwitchDate(null)}
                className="px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-lg border border-stone-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDateSwitch}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm"
              >
                Discard and Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* MODAL: SOFT-DELETE CONFIRMATION                                      */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-journal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-stone-200 space-y-3">
            <h3 id="delete-journal-title" className="text-base font-semibold text-stone-900">
              Delete Journal Entry?
            </h3>
            <p className="text-xs text-stone-600">
              Are you sure you want to delete the journal entry for <span className="font-semibold text-stone-800">{formatDateDisplay(selectedDate)}</span>? It will be soft-deleted and removed from your journal history. You can write a new entry for this date later if needed.
            </p>

            {deleteError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Entry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
