import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";
import { fetchTrashedNotes, restoreNote } from "../services/notes.service.js";
import LoadingState from "../components/LoadingState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import EmptyState from "../components/EmptyState.jsx";

const PAGE_SIZE = 20;

/**
 * Formats an ISO date string into a user-friendly timestamp.
 *
 * @param {string} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

/**
 * TrashPage - Displays soft-deleted notes with restore action and pagination.
 */
export default function TrashPage() {
  const { getCsrfToken } = useAuth();

  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [restoringId, setRestoringId] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const [restoreSuccess, setRestoreSuccess] = useState(null);

  // Stale request guard ref
  const fetchGenerationRef = useRef(0);

  const loadTrashedNotes = useCallback(async (signal) => {
    const currentGen = ++fetchGenerationRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchTrashedNotes({
        limit: PAGE_SIZE,
        offset,
        signal,
      });

      if (fetchGenerationRef.current !== currentGen || signal?.aborted) {
        return;
      }

      const rawList = Array.isArray(data.notes)
        ? data.notes
        : Array.isArray(data.items)
        ? data.items
        : [];
      const totalCount =
        typeof data.total === "number"
          ? data.total
          : offset + rawList.length;

      // Recover gracefully from an invalid/outdated offset
      if (offset > 0 && rawList.length === 0) {
        const lastValidOffset = Math.max(
          0,
          Math.floor(Math.max(0, totalCount - 1) / PAGE_SIZE) * PAGE_SIZE
        );
        if (lastValidOffset !== offset) {
          setOffset(lastValidOffset);
          return;
        }
      }

      setNotes(rawList);
      setTotal(totalCount);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      if (fetchGenerationRef.current !== currentGen || signal?.aborted || err.name === "AbortError") {
        return;
      }
      setError(err?.message || "Could not load trashed notes from server.");
    } finally {
      if (fetchGenerationRef.current === currentGen && !signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [offset]);

  useEffect(() => {
    const controller = new AbortController();
    loadTrashedNotes(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadTrashedNotes]);

  // Handle note restore
  const handleRestore = async (note) => {
    if (restoringId === note.id) return;

    setRestoringId(note.id);
    setRestoreError(null);
    setRestoreSuccess(null);

    // Optimistically remove from trash list
    setNotes((prevNotes) => prevNotes.filter((n) => n.id !== note.id));
    setTotal((prevTotal) => Math.max(0, prevTotal - 1));

    try {
      const csrfToken = await getCsrfToken();
      await restoreNote(note.id, { csrfToken });

      setRestoreSuccess({
        id: note.id,
        title: note.title || "Untitled note",
      });
    } catch (err) {
      // Revert optimistic removal on failure
      setNotes((prevNotes) => [note, ...prevNotes]);
      setTotal((prevTotal) => prevTotal + 1);
      setRestoreError(err?.message || "Failed to restore note from trash.");
    } finally {
      setRestoringId(null);
    }
  };

  const currentStart = total === 0 ? 0 : offset + 1;
  const currentEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      {/* Top Header / Description */}
      <div className="flex items-center justify-between gap-3 pb-1">
        <div className="text-xs sm:text-sm text-slate-500">
          <span>Deleted notes are preserved safely here. You can restore them anytime.</span>
        </div>

        <div>
          <Link
            to="/notes"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 py-1.5 px-3 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span>Back to Notes</span>
          </Link>
        </div>
      </div>

      {/* Restore Success Banner */}
      {restoreSuccess && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 flex items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <svg
              className="h-5 w-5 text-emerald-600 flex-shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <span>
                Restored <strong>&ldquo;{restoreSuccess.title}&rdquo;</strong> to your active notes.
              </span>{" "}
              <Link to="/notes" className="font-semibold text-emerald-700 underline hover:text-emerald-900 ml-1">
                View in Notes &rarr;
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRestoreSuccess(null)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Restore Error Banner */}
      {restoreError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 flex items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-rose-500 flex-shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
            <span>{restoreError}</span>
          </div>
          <button
            type="button"
            onClick={() => setRestoreError(null)}
            className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content States */}
      {isLoading && notes.length === 0 ? (
        <LoadingState message="Loading trashed notes..." />
      ) : error ? (
        <ErrorState
          title="Could not load trash"
          message={error}
          onRetry={() => loadTrashedNotes()}
        />
      ) : notes.length === 0 ? (
        <EmptyState
          title="Trash is empty"
          description="Deleted notes will appear here. You can restore them anytime to return them to your notes list."
          note="When you delete notes, they are preserved safely rather than permanently destroyed."
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          }
        />
      ) : (
        /* Trashed Notes Cards Grid */
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {notes.map((note) => {
              const isActionInFlight = restoringId === note.id;
              const isPinned = Boolean(note.pinned);

              return (
                <div
                  key={note.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-2xs hover:border-slate-300 transition-colors"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h2 className="text-sm sm:text-base font-semibold text-slate-900 line-clamp-1">
                          {note.title || "Untitled note"}
                        </h2>
                        {isPinned && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200 flex-shrink-0"
                            title="This note was pinned before deletion and will remain pinned when restored"
                          >
                            <svg
                              className="h-3 w-3 fill-amber-500 text-amber-700"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                            >
                              <line x1="12" y1="17" x2="12" y2="22" />
                              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                            </svg>
                            <span>Pinned</span>
                          </span>
                        )}
                      </div>

                      {/* Restore Action Button */}
                      <button
                        type="button"
                        disabled={isActionInFlight}
                        onClick={() => handleRestore(note)}
                        aria-label={`Restore note "${note.title || "Untitled note"}"`}
                        className={`inline-flex items-center gap-1.5 rounded-lg border border-[#365CF5]/20 bg-[#EEF3FF] px-2.5 py-1 text-xs font-semibold text-[#2948D8] shadow-2xs transition-colors hover:bg-[#E2E8FF] focus:outline-none focus:ring-2 focus:ring-[#365CF5]/20 ${
                          isActionInFlight ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                        }`}
                      >
                        <svg
                          className={`h-3.5 w-3.5 ${isActionInFlight ? "animate-spin" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                          />
                        </svg>
                        <span>{isActionInFlight ? "Restoring..." : "Restore"}</span>
                      </button>
                    </div>

                    <p className="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed min-h-[2rem]">
                      {note.preview || <span className="italic text-slate-400">Empty note</span>}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Deleted {formatTimestamp(note.deletedAt)}</span>
                    <span className="font-mono text-[11px] text-slate-400">v{note.version}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Toolbar */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-600">
            <div>
              Showing <span className="font-medium text-slate-900">{currentStart}</span> to{" "}
              <span className="font-medium text-slate-900">{currentEnd}</span> of{" "}
              <span className="font-medium text-slate-900">{total}</span> notes
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={offset === 0 || isLoading}
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={!hasMore || offset + PAGE_SIZE >= total || isLoading}
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

