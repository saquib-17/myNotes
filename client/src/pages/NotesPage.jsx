import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";
import { useCollections } from "../context/useCollections.js";
import { fetchNotes, createNote, pinNote, unpinNote } from "../services/notes.service.js";
import { CANONICAL_EMPTY_DOC } from "../constants/editor.js";
import LoadingState from "../components/LoadingState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import EmptyState from "../components/EmptyState.jsx";

const PAGE_SIZE = 20;

/**
 * Formats an ISO date string into a user-friendly relative or local timestamp.
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
 * NotesPage - Main notes listing view with server-side search and pagination.
 */
export default function NotesPage() {
  const { getCsrfToken } = useAuth();
  const { collections, refreshCollections } = useCollections();
  const navigate = useNavigate();

  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [pinningId, setPinningId] = useState(null);
  const [pinError, setPinError] = useState(null);

  // Debounce search input by 300ms
  const searchTimeoutRef = useRef(null);
  // Stale request guard ref: prevents obsolete out-of-order network responses from overwriting latest list
  const fetchGenerationRef = useRef(0);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchInput(val);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setOffset(0);
      setActiveQuery(val.trim());
    }, 300);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    setOffset(0);
    setActiveQuery("");
  };

  // Fetch notes from server with cancellation support and stale response guard
  const loadNotes = useCallback(async (signal) => {
    const currentGen = ++fetchGenerationRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchNotes({
        q: activeQuery,
        collectionId: selectedCollectionId || undefined,
        limit: PAGE_SIZE,
        offset,
        signal,
      });

      // Ignore response if a newer fetch was initiated or request was aborted
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

      // Recover gracefully from an invalid/outdated offset (e.g. notes deleted on later page)
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
      setError(err?.message || "Could not load notes from server.");
    } finally {
      if (fetchGenerationRef.current === currentGen && !signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [activeQuery, selectedCollectionId, offset]);

  useEffect(() => {
    const controller = new AbortController();
    loadNotes(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadNotes]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Explicit New Note creation workflow
  const handleCreateNote = async () => {
    if (isCreating) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const csrfToken = await getCsrfToken();
      const newNote = await createNote({
        title: "Untitled note",
        content: CANONICAL_EMPTY_DOC,
        collectionId: selectedCollectionId || undefined,
        csrfToken,
      });

      await refreshCollections();

      // Navigate to the newly created note editor
      navigate(`/notes/${newNote.id}`);
    } catch (err) {
      setCreateError(
        err?.message || "Could not confirm note creation with the server. Please check your connection."
      );
      setIsCreating(false);
    }
  };

  const handleTogglePin = async (e, note) => {
    e.preventDefault();
    e.stopPropagation();

    if (pinningId === note.id) return;
    setPinningId(note.id);
    setPinError(null);

    const originalPinned = Boolean(note.pinned);
    const newPinned = !originalPinned;

    // Optimistically update list
    setNotes((prevNotes) =>
      prevNotes.map((n) => (n.id === note.id ? { ...n, pinned: newPinned } : n))
    );

    try {
      const csrfToken = await getCsrfToken();
      if (newPinned) {
        await pinNote(note.id, { csrfToken });
      } else {
        await unpinNote(note.id, { csrfToken });
      }
    } catch (err) {
      // Revert optimistic update on failure
      setNotes((prevNotes) =>
        prevNotes.map((n) => (n.id === note.id ? { ...n, pinned: originalPinned } : n))
      );
      setPinError(err?.message || "Failed to update pin status.");
    } finally {
      setPinningId(null);
    }
  };

  const renderNoteCard = (note) => {
    const isPinned = Boolean(note.pinned);
    const isActionInFlight = pinningId === note.id;
    const noteCollection = note.collectionId
      ? collections.find((c) => c.id === note.collectionId)
      : null;

    return (
      <Link
        key={note.id}
        to={`/notes/${note.id}`}
        className="group relative flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-5 shadow-2xs transition-all hover:border-teal-300 hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-semibold text-stone-900 group-hover:text-teal-800 line-clamp-1">
              {note.title || "Untitled note"}
            </h2>
            <button
              type="button"
              disabled={isActionInFlight}
              onClick={(e) => handleTogglePin(e, note)}
              aria-label={isPinned ? "Unpin note" : "Pin note"}
              aria-pressed={isPinned}
              title={isPinned ? "Unpin note" : "Pin note"}
              className={`-mr-1.5 -mt-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                isPinned
                  ? "text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                  : "text-stone-400 opacity-60 hover:opacity-100 hover:bg-stone-100 hover:text-stone-700"
              }`}
            >
              <svg
                className={`h-4 w-4 ${isPinned ? "fill-amber-500 text-amber-700" : "fill-none text-stone-400"}`}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
              </svg>
            </button>
          </div>
          {noteCollection && (
            <div className="mt-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                <span>{noteCollection.name}</span>
              </span>
            </div>
          )}
          <p className="mt-2 text-sm text-stone-600 line-clamp-2 leading-relaxed min-h-[2.5rem]">
            {note.preview || <span className="italic text-stone-400">Empty note</span>}
          </p>
        </div>
        <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
          <span>Updated {formatTimestamp(note.updatedAt)}</span>
          <span className="font-mono text-[11px] text-stone-300">v{note.version}</span>
        </div>
      </Link>
    );
  };

  const currentStart = total === 0 ? 0 : offset + 1;
  const currentEnd = Math.min(offset + PAGE_SIZE, total);

  const pinnedNotes = notes.filter((n) => n.pinned);
  const regularNotes = notes.filter((n) => !n.pinned);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Actions & Description */}
      <div className="flex items-center justify-between gap-4 pb-1">
        <div className="text-sm text-stone-500">
          <span>Your notes and documentation will live here.</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/trash"
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-600 shadow-2xs hover:bg-stone-50 hover:text-stone-900 transition-colors"
            aria-label="View Trash"
          >
            <svg
              className="h-4 w-4 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
            <span>Trash</span>
          </Link>

          <button
            type="button"
            disabled={isCreating}
            onClick={handleCreateNote}
            className={`inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
              isCreating ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
            }`}
          >
            <svg
              className={`h-4 w-4 ${isCreating ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              {isCreating ? (
                <>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </>
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              )}
            </svg>
            <span>{isCreating ? "Creating..." : "New note"}</span>
          </button>
        </div>
      </div>

      {/* Ambiguous Creation Failure Feedback */}
      {createError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <svg
              className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5"
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
            <div>
              <p className="font-semibold">Creation could not be confirmed</p>
              <p className="mt-0.5 text-red-700">{createError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreateError(null)}
            className="text-xs font-semibold text-red-700 hover:text-red-900 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Pin Update Failure Feedback */}
      {pinError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-red-500 flex-shrink-0"
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
            <span>{pinError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPinError(null)}
            className="text-xs font-semibold text-red-700 hover:text-red-900 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search Input Bar & Collection Filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <div className="relative flex-1">
          <label htmlFor="notes-search" className="sr-only">
            Search notes by title or content
          </label>
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            id="notes-search"
            type="search"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Search notes by title or content..."
            className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-10 pr-10 text-sm text-stone-900 placeholder-stone-400 shadow-2xs focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-stone-400 hover:text-stone-600"
              aria-label="Clear search query"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {collections.length > 0 && (
          <div className="w-full sm:w-56">
            <label htmlFor="collection-filter" className="sr-only">
              Filter by collection
            </label>
            <select
              id="collection-filter"
              aria-label="Filter by collection"
              value={selectedCollectionId}
              onChange={(e) => {
                setOffset(0);
                setSelectedCollectionId(e.target.value);
              }}
              className="w-full rounded-lg border border-stone-300 bg-white py-2.5 px-3 text-sm text-stone-900 shadow-2xs focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              <option value="">All collections</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.noteCount || 0})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Content States */}
      {isLoading && notes.length === 0 ? (
        <LoadingState message="Loading your notes..." />
      ) : error ? (
        <ErrorState
          title="Could not load notes"
          message={error}
          onRetry={() => loadNotes()}
        />
      ) : notes.length === 0 ? (
        activeQuery ? (
          <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed border-stone-200 bg-white">
            <svg
              className="mx-auto h-10 w-10 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <h2 className="mt-3 text-base font-semibold text-stone-900">
              No notes matching &ldquo;{activeQuery}&rdquo;
            </h2>
            <p className="mt-1 text-sm text-stone-500 max-w-sm mx-auto">
              Search looks through both note titles and plain-text content. Try adjusting your query.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={handleClearSearch}
                className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50"
              >
                Clear search
              </button>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No notes yet"
            description="Your notes and documentation will live here. Capture your thoughts, ideas, and meeting notes in rich text."
            note="Click 'New note' to create your first note."
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            }
          />
        )
      ) : (
        /* Notes Cards List */
        <div className="space-y-6">
          {/* Pinned Notes Section */}
          {pinnedNotes.length > 0 && (
            <section aria-labelledby="pinned-notes-heading" className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                <svg
                  className="h-3.5 w-3.5 text-amber-600 fill-amber-500"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                </svg>
                <h2 id="pinned-notes-heading">Pinned</h2>
                <span className="text-stone-400 font-normal">({pinnedNotes.length})</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {pinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            </section>
          )}

          {/* Regular / Other Notes Section */}
          {regularNotes.length > 0 && (
            <section
              aria-labelledby={pinnedNotes.length > 0 ? "other-notes-heading" : undefined}
              className="space-y-3"
            >
              {pinnedNotes.length > 0 && (
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                  <h2 id="other-notes-heading">Other Notes</h2>
                  <span className="text-stone-400 font-normal">({regularNotes.length})</span>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {regularNotes.map((note) => renderNoteCard(note))}
              </div>
            </section>
          )}

          {/* Pagination Toolbar */}
          <div className="flex items-center justify-between border-t border-stone-200 pt-4 text-sm text-stone-600">
            <div>
              Showing <span className="font-medium text-stone-900">{currentStart}</span> to{" "}
              <span className="font-medium text-stone-900">{currentEnd}</span> of{" "}
              <span className="font-medium text-stone-900">{total}</span> notes
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={offset === 0 || isLoading}
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={!hasMore || offset + PAGE_SIZE >= total || isLoading}
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
