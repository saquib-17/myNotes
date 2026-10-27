import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "../context/useAuth.js";
import {
  fetchRevisionItems,
  createRevisionItem,
  updateRevisionItem,
  markRevisionItemRevised,
  reopenRevisionItem,
  deleteRevisionItem,
  fetchDoubts,
  createDoubt,
  updateDoubt,
  resolveDoubt,
  reopenDoubt,
  deleteDoubt,
  REVISION_ITEM_LIMITS,
  DOUBT_LIMITS,
} from "../services/notes.service.js";
import EmptyState from "../components/EmptyState.jsx";

const PAGE_SIZE = 20;

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
 * RevisionPage - Personal Revision Items and Doubt Tracking.
 * Dual-tab interface supporting topic revision queues and doubts tracking with resolutions,
 * search, subject filters, status filtering, pagination, and CSRF protection.
 */
export default function RevisionPage() {
  const { getCsrfToken } = useAuth();

  // Active Tab: 'revision' | 'doubts'
  const [activeTab, setActiveTab] = useState("revision");

  // Global operation notification / error
  const [operationError, setOperationError] = useState(null);

  // ──────────────────────────────────────────────────────────────────────────
  // Revision Items State
  // ──────────────────────────────────────────────────────────────────────────
  const [revisionItems, setRevisionItems] = useState([]);
  const [revisionTotal, setRevisionTotal] = useState(0);
  const [revisionOffset, setRevisionOffset] = useState(0);
  const [revisionHasMore, setRevisionHasMore] = useState(false);
  const [revisionLoading, setRevisionLoading] = useState(true);
  const [revisionError, setRevisionError] = useState(null);

  // Revision Filters
  const [revStatusFilter, setRevStatusFilter] = useState("all"); // 'all' | 'pending' | 'revised'
  const [revSubjectFilter, setRevSubjectFilter] = useState("");
  const [revSearchQuery, setRevSearchQuery] = useState("");
  const [revDebouncedQuery, setRevDebouncedQuery] = useState("");

  // Revision Quick-Add State
  const [revQuickTitle, setRevQuickTitle] = useState("");
  const [revQuickSubject, setRevQuickSubject] = useState("");
  const [revQuickSubmitting, setRevQuickSubmitting] = useState(false);
  const [revQuickError, setRevQuickError] = useState(null);

  // Revision Form Modal (Create / Edit)
  const [showRevModal, setShowRevModal] = useState(false);
  const [editingRevItem, setEditingRevItem] = useState(null);
  const [revFormTitle, setRevFormTitle] = useState("");
  const [revFormSubject, setRevFormSubject] = useState("");
  const [revFormDetails, setRevFormDetails] = useState("");
  const [revFormStatus, setRevFormStatus] = useState("pending");
  const [revFormSubmitting, setRevFormSubmitting] = useState(false);
  const [revFormError, setRevFormError] = useState(null);

  // Revision Delete Modal
  const [deletingRevItem, setDeletingRevItem] = useState(null);
  const [revDeleteSubmitting, setRevDeleteSubmitting] = useState(false);
  const [revDeleteError, setRevDeleteError] = useState(null);

  // ──────────────────────────────────────────────────────────────────────────
  // Doubts State
  // ──────────────────────────────────────────────────────────────────────────
  const [doubts, setDoubts] = useState([]);
  const [doubtsTotal, setDoubtsTotal] = useState(0);
  const [doubtsOffset, setDoubtsOffset] = useState(0);
  const [doubtsHasMore, setDoubtsHasMore] = useState(false);
  const [doubtsLoading, setDoubtsLoading] = useState(true);
  const [doubtsError, setDoubtsError] = useState(null);

  // Doubts Filters
  const [doubtStatusFilter, setDoubtStatusFilter] = useState("all"); // 'all' | 'open' | 'resolved'
  const [doubtSubjectFilter, setDoubtSubjectFilter] = useState("");
  const [doubtSearchQuery, setDoubtSearchQuery] = useState("");
  const [doubtDebouncedQuery, setDoubtDebouncedQuery] = useState("");

  // Doubts Quick-Add State
  const [doubtQuickQuestion, setDoubtQuickQuestion] = useState("");
  const [doubtQuickSubject, setDoubtQuickSubject] = useState("");
  const [doubtQuickSubmitting, setDoubtQuickSubmitting] = useState(false);
  const [doubtQuickError, setDoubtQuickError] = useState(null);

  // Doubts Form Modal (Create / Edit)
  const [showDoubtModal, setShowDoubtModal] = useState(false);
  const [editingDoubt, setEditingDoubt] = useState(null);
  const [doubtFormQuestion, setDoubtFormQuestion] = useState("");
  const [doubtFormSubject, setDoubtFormSubject] = useState("");
  const [doubtFormDetails, setDoubtFormDetails] = useState("");
  const [doubtFormResolution, setDoubtFormResolution] = useState("");
  const [doubtFormStatus, setDoubtFormStatus] = useState("open");
  const [doubtFormSubmitting, setDoubtFormSubmitting] = useState(false);
  const [doubtFormError, setDoubtFormError] = useState(null);

  // Doubt Resolve Modal
  const [resolvingDoubt, setResolvingDoubt] = useState(null);
  const [resolvingNotes, setResolvingNotes] = useState("");
  const [resolvingSubmitting, setResolvingSubmitting] = useState(false);
  const [resolvingError, setResolvingError] = useState(null);

  // Doubt Delete Modal
  const [deletingDoubt, setDeletingDoubt] = useState(null);
  const [doubtDeleteSubmitting, setDoubtDeleteSubmitting] = useState(false);
  const [doubtDeleteError, setDoubtDeleteError] = useState(null);

  // Generation references to guard against race conditions / stale fetches
  const revFetchGenRef = useRef(0);
  const doubtFetchGenRef = useRef(0);

  // ──────────────────────────────────────────────────────────────────────────
  // Search Debouncing
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setRevDebouncedQuery(revSearchQuery.trim());
      setRevisionOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [revSearchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDoubtDebouncedQuery(doubtSearchQuery.trim());
      setDoubtsOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [doubtSearchQuery]);

  // ──────────────────────────────────────────────────────────────────────────
  // Data Loaders
  // ──────────────────────────────────────────────────────────────────────────
  const loadRevisionItems = useCallback(
    async (signal) => {
      const currentGen = ++revFetchGenRef.current;
      setRevisionLoading(true);
      setRevisionError(null);

      try {
        const params = {
          limit: PAGE_SIZE,
          offset: revisionOffset,
        };
        if (revStatusFilter !== "all") {
          params.status = revStatusFilter;
        }
        if (revSubjectFilter.trim()) {
          params.subject = revSubjectFilter.trim();
        }
        if (revDebouncedQuery) {
          params.q = revDebouncedQuery;
        }

        const data = await fetchRevisionItems(params, signal);
        if (currentGen === revFetchGenRef.current) {
          setRevisionItems(data.revision_items || []);
          setRevisionTotal(data.total || 0);
          setRevisionHasMore(Boolean(data.has_more));
          setRevisionLoading(false);
        }
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) return;
        if (currentGen === revFetchGenRef.current) {
          setRevisionError(err.message || "Failed to load revision items.");
          setRevisionLoading(false);
        }
      }
    },
    [revisionOffset, revStatusFilter, revSubjectFilter, revDebouncedQuery]
  );

  const loadDoubts = useCallback(
    async (signal) => {
      const currentGen = ++doubtFetchGenRef.current;
      setDoubtsLoading(true);
      setDoubtsError(null);

      try {
        const params = {
          limit: PAGE_SIZE,
          offset: doubtsOffset,
        };
        if (doubtStatusFilter !== "all") {
          params.status = doubtStatusFilter;
        }
        if (doubtSubjectFilter.trim()) {
          params.subject = doubtSubjectFilter.trim();
        }
        if (doubtDebouncedQuery) {
          params.q = doubtDebouncedQuery;
        }

        const data = await fetchDoubts(params, signal);
        if (currentGen === doubtFetchGenRef.current) {
          setDoubts(data.doubts || []);
          setDoubtsTotal(data.total || 0);
          setDoubtsHasMore(Boolean(data.has_more));
          setDoubtsLoading(false);
        }
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) return;
        if (currentGen === doubtFetchGenRef.current) {
          setDoubtsError(err.message || "Failed to load doubts.");
          setDoubtsLoading(false);
        }
      }
    },
    [doubtsOffset, doubtStatusFilter, doubtSubjectFilter, doubtDebouncedQuery]
  );

  useEffect(() => {
    const controller = new AbortController();
    if (activeTab === "revision") {
      loadRevisionItems(controller.signal);
    } else {
      loadDoubts(controller.signal);
    }
    return () => controller.abort();
  }, [activeTab, loadRevisionItems, loadDoubts]);

  // ──────────────────────────────────────────────────────────────────────────
  // Revision Items Actions
  // ──────────────────────────────────────────────────────────────────────────
  const handleQuickAddRevision = async (e) => {
    e.preventDefault();
    const title = revQuickTitle.trim();
    if (!title) {
      setRevQuickError("Topic title is required.");
      return;
    }
    setRevQuickSubmitting(true);
    setRevQuickError(null);

    try {
      const csrf = await getCsrfToken();
      await createRevisionItem(
        {
          title,
          subject: revQuickSubject.trim() || undefined,
        },
        csrf
      );
      setRevQuickTitle("");
      setRevQuickSubject("");
      setRevisionOffset(0);
      await loadRevisionItems();
    } catch (err) {
      setRevQuickError(err.message || "Failed to create revision item.");
    } finally {
      setRevQuickSubmitting(false);
    }
  };

  const handleOpenRevModal = (item = null) => {
    setEditingRevItem(item);
    if (item) {
      setRevFormTitle(item.title || "");
      setRevFormSubject(item.subject || "");
      setRevFormDetails(item.details || "");
      setRevFormStatus(item.status || "pending");
    } else {
      setRevFormTitle("");
      setRevFormSubject("");
      setRevFormDetails("");
      setRevFormStatus("pending");
    }
    setRevFormError(null);
    setShowRevModal(true);
  };

  const handleSaveRevModal = async (e) => {
    e.preventDefault();
    const title = revFormTitle.trim();
    if (!title) {
      setRevFormError("Title is required.");
      return;
    }
    setRevFormSubmitting(true);
    setRevFormError(null);

    try {
      const csrf = await getCsrfToken();
      const payload = {
        title,
        subject: revFormSubject.trim() || null,
        details: revFormDetails.trim() || null,
      };

      if (editingRevItem) {
        payload.status = revFormStatus;
        await updateRevisionItem(editingRevItem.id, payload, csrf);
      } else {
        await createRevisionItem(payload, csrf);
      }

      setShowRevModal(false);
      setEditingRevItem(null);
      await loadRevisionItems();
    } catch (err) {
      setRevFormError(err.message || "Failed to save revision item.");
    } finally {
      setRevFormSubmitting(false);
    }
  };

  const handleToggleRevStatus = async (item) => {
    const isPending = item.status === "pending";
    const newStatus = isPending ? "revised" : "pending";
    const previousItems = [...revisionItems];

    // Optimistic update
    setRevisionItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              status: newStatus,
              revised_at: isPending ? new Date().toISOString() : null,
            }
          : i
      )
    );
    setOperationError(null);

    try {
      const csrf = await getCsrfToken();
      if (isPending) {
        await markRevisionItemRevised(item.id, csrf);
      } else {
        await reopenRevisionItem(item.id, csrf);
      }
    } catch (err) {
      // Rollback
      setRevisionItems(previousItems);
      setOperationError(err.message || `Failed to update revision item status.`);
    }
  };

  const handleDeleteRevConfirm = async () => {
    if (!deletingRevItem) return;
    setRevDeleteSubmitting(true);
    setRevDeleteError(null);

    try {
      const csrf = await getCsrfToken();
      await deleteRevisionItem(deletingRevItem.id, csrf);
      setDeletingRevItem(null);
      await loadRevisionItems();
    } catch (err) {
      setRevDeleteError(err.message || "Failed to delete revision item.");
    } finally {
      setRevDeleteSubmitting(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Doubts Actions
  // ──────────────────────────────────────────────────────────────────────────
  const handleQuickAddDoubt = async (e) => {
    e.preventDefault();
    const question = doubtQuickQuestion.trim();
    if (!question) {
      setDoubtQuickError("Doubt question is required.");
      return;
    }
    setDoubtQuickSubmitting(true);
    setDoubtQuickError(null);

    try {
      const csrf = await getCsrfToken();
      await createDoubt(
        {
          question,
          subject: doubtQuickSubject.trim() || undefined,
        },
        csrf
      );
      setDoubtQuickQuestion("");
      setDoubtQuickSubject("");
      setDoubtsOffset(0);
      await loadDoubts();
    } catch (err) {
      setDoubtQuickError(err.message || "Failed to create doubt.");
    } finally {
      setDoubtQuickSubmitting(false);
    }
  };

  const handleOpenDoubtModal = (doubt = null) => {
    setEditingDoubt(doubt);
    if (doubt) {
      setDoubtFormQuestion(doubt.question || "");
      setDoubtFormSubject(doubt.subject || "");
      setDoubtFormDetails(doubt.details || "");
      setDoubtFormResolution(doubt.resolution || "");
      setDoubtFormStatus(doubt.status || "open");
    } else {
      setDoubtFormQuestion("");
      setDoubtFormSubject("");
      setDoubtFormDetails("");
      setDoubtFormResolution("");
      setDoubtFormStatus("open");
    }
    setDoubtFormError(null);
    setShowDoubtModal(true);
  };

  const handleSaveDoubtModal = async (e) => {
    e.preventDefault();
    const question = doubtFormQuestion.trim();
    if (!question) {
      setDoubtFormError("Question is required.");
      return;
    }
    setDoubtFormSubmitting(true);
    setDoubtFormError(null);

    try {
      const csrf = await getCsrfToken();
      const payload = {
        question,
        subject: doubtFormSubject.trim() || null,
        details: doubtFormDetails.trim() || null,
      };

      if (editingDoubt) {
        payload.resolution = doubtFormResolution.trim() || null;
        payload.status = doubtFormStatus;
        await updateDoubt(editingDoubt.id, payload, csrf);
      } else {
        await createDoubt(payload, csrf);
      }

      setShowDoubtModal(false);
      setEditingDoubt(null);
      await loadDoubts();
    } catch (err) {
      setDoubtFormError(err.message || "Failed to save doubt.");
    } finally {
      setDoubtFormSubmitting(false);
    }
  };

  const handleOpenResolveModal = (doubt) => {
    setResolvingDoubt(doubt);
    setResolvingNotes(doubt.resolution || "");
    setResolvingError(null);
  };

  const handleConfirmResolveDoubt = async (e) => {
    e.preventDefault();
    if (!resolvingDoubt) return;
    setResolvingSubmitting(true);
    setResolvingError(null);

    try {
      const csrf = await getCsrfToken();
      await resolveDoubt(
        resolvingDoubt.id,
        { resolution: resolvingNotes.trim() || undefined },
        csrf
      );
      setResolvingDoubt(null);
      await loadDoubts();
    } catch (err) {
      setResolvingError(err.message || "Failed to resolve doubt.");
    } finally {
      setResolvingSubmitting(false);
    }
  };

  const handleReopenDoubt = async (doubt) => {
    const previousDoubts = [...doubts];

    // Optimistic reopen
    setDoubts((prev) =>
      prev.map((d) =>
        d.id === doubt.id
          ? {
              ...d,
              status: "open",
              resolved_at: null,
            }
          : d
      )
    );
    setOperationError(null);

    try {
      const csrf = await getCsrfToken();
      await reopenDoubt(doubt.id, csrf);
    } catch (err) {
      // Rollback
      setDoubts(previousDoubts);
      setOperationError(err.message || "Failed to reopen doubt.");
    }
  };

  const handleDeleteDoubtConfirm = async () => {
    if (!deletingDoubt) return;
    setDoubtDeleteSubmitting(true);
    setDoubtDeleteError(null);

    try {
      const csrf = await getCsrfToken();
      await deleteDoubt(deletingDoubt.id, csrf);
      setDeletingDoubt(null);
      await loadDoubts();
    } catch (err) {
      setDoubtDeleteError(err.message || "Failed to delete doubt.");
    } finally {
      setDoubtDeleteSubmitting(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Tab Switching
  // ──────────────────────────────────────────────────────────────────────────
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setOperationError(null);
  };

  // Render Helpers
  const revisionRangeText = useMemo(() => {
    if (revisionTotal === 0) return "0 items";
    const start = revisionOffset + 1;
    const end = Math.min(revisionOffset + PAGE_SIZE, revisionTotal);
    return `Showing ${start}-${end} of ${revisionTotal} items`;
  }, [revisionOffset, revisionTotal]);

  const doubtsRangeText = useMemo(() => {
    if (doubtsTotal === 0) return "0 doubts";
    const start = doubtsOffset + 1;
    const end = Math.min(doubtsOffset + PAGE_SIZE, doubtsTotal);
    return `Showing ${start}-${end} of ${doubtsTotal} doubts`;
  }, [doubtsOffset, doubtsTotal]);

  return (
    <div className="space-y-6">
      {/* Page Header / Subtitle required by tests */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <p className="text-sm text-stone-600">Track spaced repetition and revision schedules.</p>
          <p className="text-xs text-stone-400 mt-0.5">
            Keep track of core placement topics to revisit and track questions and doubts until resolved.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "revision" ? (
            <button
              type="button"
              onClick={() => handleOpenRevModal(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Revision Topic
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleOpenDoubtModal(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Doubt
            </button>
          )}
        </div>
      </div>

      {/* Operation Error Notice */}
      {operationError && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between"
        >
          <span>{operationError}</span>
          <button
            onClick={() => setOperationError(null)}
            className="text-red-500 hover:text-red-700 text-xs font-semibold uppercase"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex border-b border-stone-200" role="tablist" aria-label="Revision and Doubts Sections">
        <button
          type="button"
          role="tab"
          id="tab-revision"
          aria-selected={activeTab === "revision"}
          aria-controls="panel-revision"
          onClick={() => handleTabChange("revision")}
          className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "revision"
              ? "border-emerald-600 text-emerald-700 font-semibold"
              : "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Revision Items
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === "revision" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600"
            }`}
          >
            {revisionTotal}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-doubts"
          aria-selected={activeTab === "doubts"}
          aria-controls="panel-doubts"
          onClick={() => handleTabChange("doubts")}
          className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "doubts"
              ? "border-amber-600 text-amber-700 font-semibold"
              : "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Doubts & Questions
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === "doubts" ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"
            }`}
          >
            {doubtsTotal}
          </span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: REVISION ITEMS                                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "revision" && (
        <div id="panel-revision" role="tabpanel" aria-labelledby="tab-revision" className="space-y-6">
          {/* Quick Add Bar */}
          <form
            onSubmit={handleQuickAddRevision}
            className="p-4 bg-stone-50 border border-stone-200 rounded-xl flex flex-col md:flex-row gap-3 items-stretch md:items-center shadow-sm"
          >
            <div className="flex-1">
              <label htmlFor="rev-quick-title" className="sr-only">
                Topic Title
              </label>
              <input
                id="rev-quick-title"
                type="text"
                value={revQuickTitle}
                onChange={(e) => setRevQuickTitle(e.target.value)}
                maxLength={REVISION_ITEM_LIMITS.MAX_TITLE_LENGTH}
                placeholder="Quick add topic to revise (e.g. Graph BFS vs DFS edge cases)..."
                disabled={revQuickSubmitting}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div className="w-full md:w-48">
              <label htmlFor="rev-quick-subject" className="sr-only">
                Subject (Optional)
              </label>
              <input
                id="rev-quick-subject"
                type="text"
                value={revQuickSubject}
                onChange={(e) => setRevQuickSubject(e.target.value)}
                maxLength={REVISION_ITEM_LIMITS.MAX_SUBJECT_LENGTH}
                placeholder="Subject (e.g. DSA)"
                disabled={revQuickSubmitting}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={revQuickSubmitting || !revQuickTitle.trim()}
              className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
            >
              {revQuickSubmitting ? "Adding..." : "Add Topic"}
            </button>
          </form>

          {revQuickError && (
            <p className="text-xs text-red-600 px-1">{revQuickError}</p>
          )}

          {/* Filter & Search Bar */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Status Tabs */}
            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setRevStatusFilter("all");
                  setRevisionOffset(0);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  revStatusFilter === "all"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                All Status
              </button>
              <button
                type="button"
                onClick={() => {
                  setRevStatusFilter("pending");
                  setRevisionOffset(0);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  revStatusFilter === "pending"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => {
                  setRevStatusFilter("revised");
                  setRevisionOffset(0);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  revStatusFilter === "revised"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Revised
              </button>
            </div>

            {/* Subject Filter & Search Input */}
            <div className="flex items-center gap-2 flex-1 md:max-w-md">
              <input
                type="text"
                value={revSubjectFilter}
                onChange={(e) => {
                  setRevSubjectFilter(e.target.value);
                  setRevisionOffset(0);
                }}
                placeholder="Filter by subject..."
                className="w-1/3 px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="relative flex-1">
                <input
                  type="text"
                  value={revSearchQuery}
                  onChange={(e) => setRevSearchQuery(e.target.value)}
                  placeholder="Search revision topics..."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {revSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setRevSearchQuery("")}
                    className="absolute right-2 top-1.5 text-stone-400 hover:text-stone-600 text-xs"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* List or Empty State */}
          {revisionLoading ? (
            <div className="p-8 text-center text-sm text-stone-500" aria-live="polite">
              Loading revision topics...
            </div>
          ) : revisionError ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
              <p className="text-sm text-red-700">{revisionError}</p>
              <button
                type="button"
                onClick={() => loadRevisionItems()}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          ) : revisionItems.length === 0 ? (
            <EmptyState
              title={
                revDebouncedQuery || revSubjectFilter
                  ? "No matching revision topics found"
                  : revStatusFilter === "pending"
                  ? "No pending topics to revise"
                  : revStatusFilter === "revised"
                  ? "No revised topics yet"
                  : "No revision topics yet"
              }
              description={
                revDebouncedQuery || revSubjectFilter
                  ? "Try clearing filters or search queries to see more items."
                  : "Add topics you need to review before interviews or exams."
              }
              icon={
                <svg className="w-8 h-8 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          ) : (
            <div className="space-y-3">
              {revisionItems.map((item) => {
                const isRevised = item.status === "revised";
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-all bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:shadow ${
                      isRevised ? "border-stone-200 bg-stone-50/50" : "border-stone-200"
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Checkbox / Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleRevStatus(item)}
                        aria-label={isRevised ? "Reopen topic" : "Mark topic as revised"}
                        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          isRevised
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-stone-300 hover:border-emerald-500 bg-white"
                        }`}
                      >
                        {isRevised && (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>

                      {/* Content Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h2
                            className={`text-sm font-semibold truncate ${
                              isRevised ? "text-stone-500 line-through" : "text-stone-900"
                            }`}
                          >
                            {item.title}
                          </h2>

                          {item.subject && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {item.subject}
                            </span>
                          )}

                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              isRevised
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : "bg-amber-50 text-amber-700 border border-amber-100"
                            }`}
                          >
                            {isRevised ? "Revised" : "Pending"}
                          </span>
                        </div>

                        {item.details && (
                          <p className="text-xs text-stone-600 line-clamp-2 mt-1 whitespace-pre-wrap">
                            {item.details}
                          </p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-stone-400 mt-2">
                          {isRevised && item.revised_at ? (
                            <span>Revised on {formatTimestamp(item.revised_at)}</span>
                          ) : (
                            <span>Added on {formatTimestamp(item.created_at)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => handleToggleRevStatus(item)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                          isRevised
                            ? "border-stone-300 text-stone-700 hover:bg-stone-100"
                            : "border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                        }`}
                      >
                        {isRevised ? "Reopen" : "Mark Revised"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenRevModal(item)}
                        className="p-1.5 text-stone-500 hover:text-stone-800 rounded-lg hover:bg-stone-100 transition-colors"
                        aria-label="Edit topic"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingRevItem(item)}
                        className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        aria-label="Delete topic"
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
                    </div>
                  </div>
                );
              })}

              {/* Pagination Controls */}
              {revisionTotal > PAGE_SIZE && (
                <div className="flex items-center justify-between border-t border-stone-200 pt-4 px-1">
                  <span className="text-xs text-stone-500">{revisionRangeText}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={revisionOffset === 0}
                      onClick={() => setRevisionOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={!revisionHasMore}
                      onClick={() => setRevisionOffset((prev) => prev + PAGE_SIZE)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: DOUBTS & QUESTIONS                                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "doubts" && (
        <div id="panel-doubts" role="tabpanel" aria-labelledby="tab-doubts" className="space-y-6">
          {/* Quick Add Bar */}
          <form
            onSubmit={handleQuickAddDoubt}
            className="p-4 bg-stone-50 border border-stone-200 rounded-xl flex flex-col md:flex-row gap-3 items-stretch md:items-center shadow-sm"
          >
            <div className="flex-1">
              <label htmlFor="doubt-quick-question" className="sr-only">
                Doubt Question
              </label>
              <input
                id="doubt-quick-question"
                type="text"
                value={doubtQuickQuestion}
                onChange={(e) => setDoubtQuickQuestion(e.target.value)}
                maxLength={DOUBT_LIMITS.MAX_QUESTION_LENGTH}
                placeholder="Ask or record a doubt (e.g. Why does volatile not guarantee atomicity in Java?)..."
                disabled={doubtQuickSubmitting}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
            <div className="w-full md:w-48">
              <label htmlFor="doubt-quick-subject" className="sr-only">
                Subject (Optional)
              </label>
              <input
                id="doubt-quick-subject"
                type="text"
                value={doubtQuickSubject}
                onChange={(e) => setDoubtQuickSubject(e.target.value)}
                maxLength={DOUBT_LIMITS.MAX_SUBJECT_LENGTH}
                placeholder="Subject (e.g. Java)"
                disabled={doubtQuickSubmitting}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={doubtQuickSubmitting || !doubtQuickQuestion.trim()}
              className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
            >
              {doubtQuickSubmitting ? "Adding..." : "Ask Doubt"}
            </button>
          </form>

          {doubtQuickError && (
            <p className="text-xs text-red-600 px-1">{doubtQuickError}</p>
          )}

          {/* Filter & Search Bar */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Status Tabs */}
            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setDoubtStatusFilter("all");
                  setDoubtsOffset(0);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  doubtStatusFilter === "all"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                All Status
              </button>
              <button
                type="button"
                onClick={() => {
                  setDoubtStatusFilter("open");
                  setDoubtsOffset(0);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  doubtStatusFilter === "open"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Open Doubts
              </button>
              <button
                type="button"
                onClick={() => {
                  setDoubtStatusFilter("resolved");
                  setDoubtsOffset(0);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  doubtStatusFilter === "resolved"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Resolved
              </button>
            </div>

            {/* Subject Filter & Search Input */}
            <div className="flex items-center gap-2 flex-1 md:max-w-md">
              <input
                type="text"
                value={doubtSubjectFilter}
                onChange={(e) => {
                  setDoubtSubjectFilter(e.target.value);
                  setDoubtsOffset(0);
                }}
                placeholder="Filter by subject..."
                className="w-1/3 px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="relative flex-1">
                <input
                  type="text"
                  value={doubtSearchQuery}
                  onChange={(e) => setDoubtSearchQuery(e.target.value)}
                  placeholder="Search doubts..."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {doubtSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setDoubtSearchQuery("")}
                    className="absolute right-2 top-1.5 text-stone-400 hover:text-stone-600 text-xs"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Doubts List or Empty State */}
          {doubtsLoading ? (
            <div className="p-8 text-center text-sm text-stone-500" aria-live="polite">
              Loading doubts...
            </div>
          ) : doubtsError ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
              <p className="text-sm text-red-700">{doubtsError}</p>
              <button
                type="button"
                onClick={() => loadDoubts()}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          ) : doubts.length === 0 ? (
            <EmptyState
              title={
                doubtDebouncedQuery || doubtSubjectFilter
                  ? "No matching doubts found"
                  : doubtStatusFilter === "open"
                  ? "No open doubts"
                  : doubtStatusFilter === "resolved"
                  ? "No resolved doubts yet"
                  : "No doubts recorded yet"
              }
              description={
                doubtDebouncedQuery || doubtSubjectFilter
                  ? "Try clearing filters or search queries to see more doubts."
                  : "Record confusion, questions, and clarify concepts here."
              }
              icon={
                <svg className="w-8 h-8 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          ) : (
            <div className="space-y-4">
              {doubts.map((doubt) => {
                const isResolved = doubt.status === "resolved";
                return (
                  <div
                    key={doubt.id}
                    className={`p-4 rounded-xl border transition-all bg-white shadow-sm hover:shadow ${
                      isResolved ? "border-stone-200 bg-stone-50/40" : "border-stone-200"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Badges & Question */}
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              isResolved
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : "bg-amber-50 text-amber-700 border border-amber-100"
                            }`}
                          >
                            {isResolved ? "Resolved" : "Open"}
                          </span>

                          {doubt.subject && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {doubt.subject}
                            </span>
                          )}
                        </div>

                        <h2 className="text-base font-semibold text-stone-900 mt-1 whitespace-pre-wrap">
                          {doubt.question}
                        </h2>

                        {doubt.details && (
                          <p className="text-xs text-stone-600 whitespace-pre-wrap mt-2 bg-stone-50 p-2.5 rounded-lg border border-stone-200/60">
                            {doubt.details}
                          </p>
                        )}

                        {/* Resolution Callout */}
                        {isResolved && doubt.resolution && (
                          <div className="mt-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block mb-1">
                              Resolution
                            </span>
                            <p className="text-xs text-emerald-900 whitespace-pre-wrap">
                              {doubt.resolution}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center gap-4 text-xs text-stone-400 mt-3">
                          {isResolved && doubt.resolved_at ? (
                            <span>Resolved on {formatTimestamp(doubt.resolved_at)}</span>
                          ) : (
                            <span>Asked on {formatTimestamp(doubt.created_at)}</span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 self-end md:self-start">
                        {isResolved ? (
                          <button
                            type="button"
                            onClick={() => handleReopenDoubt(doubt)}
                            className="px-3 py-1 text-xs font-medium rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors"
                          >
                            Reopen
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenResolveModal(doubt)}
                            className="px-3 py-1 text-xs font-medium rounded-lg border border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                          >
                            Resolve Doubt
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenDoubtModal(doubt)}
                          className="p-1.5 text-stone-500 hover:text-stone-800 rounded-lg hover:bg-stone-100 transition-colors"
                          aria-label="Edit doubt"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingDoubt(doubt)}
                          className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          aria-label="Delete doubt"
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
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Pagination Controls */}
              {doubtsTotal > PAGE_SIZE && (
                <div className="flex items-center justify-between border-t border-stone-200 pt-4 px-1">
                  <span className="text-xs text-stone-500">{doubtsRangeText}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={doubtsOffset === 0}
                      onClick={() => setDoubtsOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={!doubtsHasMore}
                      onClick={() => setDoubtsOffset((prev) => prev + PAGE_SIZE)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: CREATE / EDIT REVISION ITEM                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showRevModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rev-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 id="rev-modal-title" className="text-base font-semibold text-stone-900 mb-4">
              {editingRevItem ? "Edit Revision Topic" : "New Revision Topic"}
            </h3>

            {revFormError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {revFormError}
              </div>
            )}

            <form onSubmit={handleSaveRevModal} className="space-y-4">
              <div>
                <label htmlFor="rev-form-title" className="block text-xs font-medium text-stone-700 mb-1">
                  Topic Title *
                </label>
                <input
                  id="rev-form-title"
                  type="text"
                  required
                  value={revFormTitle}
                  onChange={(e) => setRevFormTitle(e.target.value)}
                  maxLength={REVISION_ITEM_LIMITS.MAX_TITLE_LENGTH}
                  placeholder="e.g. Dynamic Programming (0/1 Knapsack variations)"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">
                  {revFormTitle.length}/{REVISION_ITEM_LIMITS.MAX_TITLE_LENGTH} chars
                </span>
              </div>

              <div>
                <label htmlFor="rev-form-subject" className="block text-xs font-medium text-stone-700 mb-1">
                  Subject (Optional)
                </label>
                <input
                  id="rev-form-subject"
                  type="text"
                  value={revFormSubject}
                  onChange={(e) => setRevFormSubject(e.target.value)}
                  maxLength={REVISION_ITEM_LIMITS.MAX_SUBJECT_LENGTH}
                  placeholder="e.g. Algorithms"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="rev-form-details" className="block text-xs font-medium text-stone-700 mb-1">
                  Details & Key Concepts (Optional)
                </label>
                <textarea
                  id="rev-form-details"
                  rows={4}
                  value={revFormDetails}
                  onChange={(e) => setRevFormDetails(e.target.value)}
                  maxLength={REVISION_ITEM_LIMITS.MAX_DETAILS_LENGTH}
                  placeholder="Key edge cases, formulas, or tricky interview questions to remember..."
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">
                  {revFormDetails.length}/{REVISION_ITEM_LIMITS.MAX_DETAILS_LENGTH} chars
                </span>
              </div>

              {editingRevItem && (
                <div>
                  <label htmlFor="rev-form-status" className="block text-xs font-medium text-stone-700 mb-1">
                    Status
                  </label>
                  <select
                    id="rev-form-status"
                    value={revFormStatus}
                    onChange={(e) => setRevFormStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="pending">Pending</option>
                    <option value="revised">Revised</option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  disabled={revFormSubmitting}
                  onClick={() => setShowRevModal(false)}
                  className="px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={revFormSubmitting || !revFormTitle.trim()}
                  className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {revFormSubmitting ? "Saving..." : editingRevItem ? "Save Changes" : "Create Topic"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: RESOLVE DOUBT (PROMPT FOR OPTIONAL RESOLUTION)               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {resolvingDoubt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resolve-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 id="resolve-modal-title" className="text-base font-semibold text-stone-900 mb-2">
              Mark Doubt as Resolved
            </h3>
            <p className="text-xs text-stone-600 mb-4">
              Doubt: <span className="font-medium text-stone-800">{resolvingDoubt.question}</span>
            </p>

            {resolvingError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {resolvingError}
              </div>
            )}

            <form onSubmit={handleConfirmResolveDoubt} className="space-y-4">
              <div>
                <label htmlFor="resolve-notes" className="block text-xs font-medium text-stone-700 mb-1">
                  Resolution / Explanation (Optional)
                </label>
                <textarea
                  id="resolve-notes"
                  rows={4}
                  value={resolvingNotes}
                  onChange={(e) => setResolvingNotes(e.target.value)}
                  maxLength={DOUBT_LIMITS.MAX_RESOLUTION_LENGTH}
                  placeholder="Record how this doubt was answered or resolved for future review..."
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">
                  {resolvingNotes.length}/{DOUBT_LIMITS.MAX_RESOLUTION_LENGTH} chars
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  disabled={resolvingSubmitting}
                  onClick={() => setResolvingDoubt(null)}
                  className="px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolvingSubmitting}
                  className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {resolvingSubmitting ? "Resolving..." : "Confirm Resolved"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: CREATE / EDIT DOUBT                                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showDoubtModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doubt-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 id="doubt-modal-title" className="text-base font-semibold text-stone-900 mb-4">
              {editingDoubt ? "Edit Doubt" : "New Doubt"}
            </h3>

            {doubtFormError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {doubtFormError}
              </div>
            )}

            <form onSubmit={handleSaveDoubtModal} className="space-y-4">
              <div>
                <label htmlFor="doubt-form-question" className="block text-xs font-medium text-stone-700 mb-1">
                  Question *
                </label>
                <textarea
                  id="doubt-form-question"
                  rows={2}
                  required
                  value={doubtFormQuestion}
                  onChange={(e) => setDoubtFormQuestion(e.target.value)}
                  maxLength={DOUBT_LIMITS.MAX_QUESTION_LENGTH}
                  placeholder="e.g. Why does synchronized block require an object monitor?"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">
                  {doubtFormQuestion.length}/{DOUBT_LIMITS.MAX_QUESTION_LENGTH} chars
                </span>
              </div>

              <div>
                <label htmlFor="doubt-form-subject" className="block text-xs font-medium text-stone-700 mb-1">
                  Subject (Optional)
                </label>
                <input
                  id="doubt-form-subject"
                  type="text"
                  value={doubtFormSubject}
                  onChange={(e) => setDoubtFormSubject(e.target.value)}
                  maxLength={DOUBT_LIMITS.MAX_SUBJECT_LENGTH}
                  placeholder="e.g. Java Concurrency"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label htmlFor="doubt-form-details" className="block text-xs font-medium text-stone-700 mb-1">
                  Details / Context (Optional)
                </label>
                <textarea
                  id="doubt-form-details"
                  rows={3}
                  value={doubtFormDetails}
                  onChange={(e) => setDoubtFormDetails(e.target.value)}
                  maxLength={DOUBT_LIMITS.MAX_DETAILS_LENGTH}
                  placeholder="Where did you encounter this? Code snippet or link context..."
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {editingDoubt && (
                <>
                  <div>
                    <label htmlFor="doubt-form-resolution" className="block text-xs font-medium text-stone-700 mb-1">
                      Resolution / Solution Notes (Optional)
                    </label>
                    <textarea
                      id="doubt-form-resolution"
                      rows={3}
                      value={doubtFormResolution}
                      onChange={(e) => setDoubtFormResolution(e.target.value)}
                      maxLength={DOUBT_LIMITS.MAX_RESOLUTION_LENGTH}
                      placeholder="The answer or explanation once resolved..."
                      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="doubt-form-status" className="block text-xs font-medium text-stone-700 mb-1">
                      Status
                    </label>
                    <select
                      id="doubt-form-status"
                      value={doubtFormStatus}
                      onChange={(e) => setDoubtFormStatus(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="open">Open</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  disabled={doubtFormSubmitting}
                  onClick={() => setShowDoubtModal(false)}
                  className="px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={doubtFormSubmitting || !doubtFormQuestion.trim()}
                  className="px-4 py-2 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {doubtFormSubmitting ? "Saving..." : editingDoubt ? "Save Changes" : "Create Doubt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: DELETE CONFIRMATION (REVISION ITEM)                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {deletingRevItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-rev-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-stone-200">
            <h3 id="delete-rev-title" className="text-base font-semibold text-stone-900 mb-2">
              Delete Revision Topic?
            </h3>
            <p className="text-xs text-stone-600 mb-4">
              Are you sure you want to delete <span className="font-semibold text-stone-800">{deletingRevItem.title}</span>?
              It will be soft-deleted and removed from your queue.
            </p>

            {revDeleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {revDeleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={revDeleteSubmitting}
                onClick={() => setDeletingRevItem(null)}
                className="px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revDeleteSubmitting}
                onClick={handleDeleteRevConfirm}
                className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {revDeleteSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: DELETE CONFIRMATION (DOUBT)                                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {deletingDoubt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-doubt-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-stone-200">
            <h3 id="delete-doubt-title" className="text-base font-semibold text-stone-900 mb-2">
              Delete Doubt?
            </h3>
            <p className="text-xs text-stone-600 mb-4">
              Are you sure you want to delete this doubt? It will be soft-deleted and removed from your list.
            </p>

            {doubtDeleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {doubtDeleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={doubtDeleteSubmitting}
                onClick={() => setDeletingDoubt(null)}
                className="px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={doubtDeleteSubmitting}
                onClick={handleDeleteDoubtConfirm}
                className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {doubtDeleteSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
