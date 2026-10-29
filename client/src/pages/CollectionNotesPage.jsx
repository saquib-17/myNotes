import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";
import { useCollections } from "../context/useCollections.js";
import {
  fetchCollectionNotes,
  createNote,
  pinNote,
  unpinNote,
} from "../services/notes.service.js";
import { CANONICAL_EMPTY_DOC } from "../constants/editor.js";
import LoadingState from "../components/LoadingState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import EmptyState from "../components/EmptyState.jsx";

const PAGE_SIZE = 20;

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

export default function CollectionNotesPage() {
  const { collectionId } = useParams();
  const navigate = useNavigate();
  const { getCsrfToken } = useAuth();
  const { collections, updateCollection, deleteCollection, refreshCollections } = useCollections();

  const [collection, setCollection] = useState(null);
  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [pinningId, setPinningId] = useState(null);
  const [pinError, setPinError] = useState(null);

  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [renameError, setRenameError] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const searchTimeoutRef = useRef(null);
  const fetchGenerationRef = useRef(0);

  // Sync collection from context or response
  useEffect(() => {
    const found = collections.find((c) => c.id === collectionId);
    if (found) {
      setCollection(found);
    }
  }, [collections, collectionId]);

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

  const loadNotes = useCallback(
    async (signal) => {
      const currentGen = ++fetchGenerationRef.current;
      setIsLoading(true);
      setError(null);
      setIsNotFound(false);

      try {
        const data = await fetchCollectionNotes(collectionId, {
          q: activeQuery,
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
          typeof data.total === "number" ? data.total : offset + rawList.length;

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
        if (data.collection) {
          setCollection(data.collection);
        }
      } catch (err) {
        if (
          fetchGenerationRef.current !== currentGen ||
          signal?.aborted ||
          err.name === "AbortError"
        ) {
          return;
        }
        if (err.status === 404) {
          setIsNotFound(true);
        } else {
          setError(err?.message || "Could not load collection notes from server.");
        }
      } finally {
        if (fetchGenerationRef.current === currentGen && !signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [collectionId, activeQuery, offset]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadNotes(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadNotes]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleCreateNote = async () => {
    if (isCreating) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const csrfToken = await getCsrfToken();
      const newNote = await createNote({
        title: "Untitled note",
        content: CANONICAL_EMPTY_DOC,
        collectionId,
        csrfToken,
      });

      await refreshCollections();
      navigate(`/notes/${newNote.id}`);
    } catch (err) {
      setCreateError(
        err?.message || "Could not confirm note creation. Please check your connection."
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
      setNotes((prevNotes) =>
        prevNotes.map((n) => (n.id === note.id ? { ...n, pinned: originalPinned } : n))
      );
      setPinError(err?.message || "Failed to update pin status.");
    } finally {
      setPinningId(null);
    }
  };

  const openRenameModal = () => {
    setRenameInput(collection?.name || "");
    setRenameError(null);
    setShowRenameModal(true);
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    const trimmed = renameInput.trim();
    if (!trimmed) {
      setRenameError("Collection name cannot be empty.");
      return;
    }
    if (trimmed.length > 80) {
      setRenameError("Collection name cannot exceed 80 characters.");
      return;
    }

    setIsRenaming(true);
    setRenameError(null);

    try {
      const updated = await updateCollection(collectionId, trimmed);
      setCollection((prev) => ({ ...prev, name: updated.name }));
      setShowRenameModal(false);
    } catch (err) {
      if (err.status === 409 || err.code === "COLLECTION_CONFLICT") {
        setRenameError("A collection with this name already exists.");
      } else {
        setRenameError(err?.message || "Failed to rename collection.");
      }
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteSubmit = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteCollection(collectionId);
      navigate("/notes");
    } catch (err) {
      setDeleteError(err?.message || "Failed to delete collection.");
      setIsDeleting(false);
    }
  };

  const renderNoteCard = (note) => {
    const isPinned = Boolean(note.pinned);
    const isActionInFlight = pinningId === note.id;

    return (
      <Link
        key={note.id}
        to={`/notes/${note.id}`}
        className="group relative flex flex-col justify-between rounded-xl border border-[#E6EAF2] bg-white p-5 shadow-2xs transition-all hover:border-[#365CF5]/40 hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-[#365CF5]/20"
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-semibold text-[#182230] group-hover:text-[#365CF5] line-clamp-1">
              {note.title || "Untitled note"}
            </h2>
            <button
              type="button"
              disabled={isActionInFlight}
              onClick={(e) => handleTogglePin(e, note)}
              aria-label={isPinned ? "Unpin note" : "Pin note"}
              aria-pressed={isPinned}
              title={isPinned ? "Unpin note" : "Pin note"}
              className={`-mr-1.5 -mt-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#93C5FD] ${
                isPinned
                  ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                  : "text-[#8A94A6] opacity-60 hover:opacity-100 hover:bg-[#F1F4F9] hover:text-[#182230]"
              }`}
            >
              <svg
                className={`h-4 w-4 ${isPinned ? "fill-amber-500 text-amber-600" : "fill-none text-slate-400"}`}
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
          <p className="mt-2 text-sm text-slate-600 line-clamp-2 leading-relaxed min-h-[2.5rem]">
            {note.preview || <span className="italic text-slate-400">Empty note</span>}
          </p>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>Updated {formatTimestamp(note.updatedAt)}</span>
          <span className="font-mono text-[11px] text-slate-400">v{note.version}</span>
        </div>
      </Link>
    );
  };

  if (isNotFound) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h2 className="text-xl font-bold text-slate-900">Collection Not Found</h2>
        <p className="mt-2 text-sm text-slate-600">
          This collection does not exist or has been deleted.
        </p>
        <div className="mt-6">
          <Link
            to="/notes"
            className="inline-flex items-center rounded-lg bg-[#365CF5] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#2848D8] transition-colors"
          >
            Back to Notes
          </Link>
        </div>
      </div>
    );
  }

  const currentStart = total === 0 ? 0 : offset + 1;
  const currentEnd = Math.min(offset + PAGE_SIZE, total);

  const pinnedNotes = notes.filter((n) => n.pinned);
  const regularNotes = notes.filter((n) => !n.pinned);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Collection Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E6EAF2]">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/notes"
              className="text-xs text-[#667085] hover:text-[#182230] transition-colors"
            >
              Notes
            </Link>
            <span className="text-xs text-[#8A94A6]">/</span>
            <span className="text-xs font-semibold text-[#365CF5]">Collection</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>{collection?.name || "Collection"}</span>
            <span className="text-sm font-normal text-slate-500">
              ({total} {total === 1 ? "note" : "notes"})
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={openRenameModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EF] bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-2xs hover:bg-[#F4F6FB] transition-colors"
          >
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
            </svg>
            <span>Rename</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setShowDeleteModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EF] bg-white px-3 py-2 text-sm font-medium text-rose-600 shadow-2xs hover:bg-rose-50 transition-colors"
          >
            <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            <span>Delete</span>
          </button>

          <button
            type="button"
            disabled={isCreating}
            onClick={handleCreateNote}
            className={`inline-flex items-center gap-2 rounded-lg bg-[#365CF5] px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#2848D8] ${
              isCreating ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
            }`}
          >
            <svg
              className={`h-4 w-4 ${isCreating ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
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

      {createError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {createError}
        </div>
      )}

      {pinError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {pinError}
        </div>
      )}

      {/* Search Input Bar */}
      <div className="relative">
        <label htmlFor="collection-notes-search" className="sr-only">
          Search collection notes
        </label>
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <input
          id="collection-notes-search"
          type="search"
          value={searchInput}
          onChange={handleSearchChange}
          placeholder={`Search notes in "${collection?.name || "collection"}"...`}
          className="w-full rounded-lg border border-[#DCE3EF] bg-white py-2.5 pl-10 pr-10 text-sm text-[#182230] placeholder-[#8A94A6] shadow-2xs focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
        />
        {searchInput && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
            aria-label="Clear search query"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Content States */}
      {isLoading && notes.length === 0 ? (
        <LoadingState message="Loading collection notes..." />
      ) : error ? (
        <ErrorState
          title="Could not load collection notes"
          message={error}
          onRetry={() => loadNotes()}
        />
      ) : notes.length === 0 ? (
        activeQuery ? (
          <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed border-slate-200 bg-white">
            <h2 className="text-base font-semibold text-slate-900">
              No notes matching &ldquo;{activeQuery}&rdquo; in this collection
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Try searching with different terms or clear the search query.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={handleClearSearch}
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
              >
                Clear search
              </button>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No notes in this collection yet"
            description="Organize your notes by assigning them to this collection from the note editor or creating a new note directly."
            note="Click 'New note' to create a note in this collection."
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            }
          />
        )
      ) : (
        <div className="space-y-6">
          {/* Pinned Notes Section */}
          {pinnedNotes.length > 0 && (
            <section aria-labelledby="collection-pinned-notes-heading" className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <svg
                  className="h-3.5 w-3.5 text-amber-500 fill-amber-500"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                </svg>
                <h2 id="collection-pinned-notes-heading">Pinned</h2>
                <span className="text-slate-400 font-normal">({pinnedNotes.length})</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {pinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            </section>
          )}

          {/* Regular Notes Section */}
          {regularNotes.length > 0 && (
            <section
              aria-labelledby={pinnedNotes.length > 0 ? "collection-other-notes-heading" : undefined}
              className="space-y-3"
            >
              {pinnedNotes.length > 0 && (
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <h2 id="collection-other-notes-heading">Other Notes</h2>
                  <span className="text-slate-400 font-normal">({regularNotes.length})</span>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {regularNotes.map((note) => renderNoteCard(note))}
              </div>
            </section>
          )}

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
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={!hasMore || offset + PAGE_SIZE >= total || isLoading}
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-collection-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h2 id="rename-collection-title" className="text-lg font-bold text-slate-900">
              Rename Collection
            </h2>
            <form onSubmit={handleRenameSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="rename-collection-input" className="block text-xs font-medium text-slate-700">
                  Collection Name (1–80 characters)
                </label>
                <input
                  id="rename-collection-input"
                  type="text"
                  maxLength={80}
                  autoFocus
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DCE3EF] bg-white px-3 py-2 text-sm text-[#182230] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
                />
              </div>

              {renameError && (
                <div role="alert" className="text-xs text-rose-600">
                  {renameError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isRenaming}
                  onClick={() => setShowRenameModal(false)}
                  className="rounded-lg border border-[#DCE3EF] px-3.5 py-2 text-sm font-medium text-[#344054] hover:bg-[#F4F6FB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRenaming || !renameInput.trim()}
                  className="rounded-lg bg-[#365CF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2848D8] disabled:opacity-50 transition-colors"
                >
                  {isRenaming ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-collection-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h2 id="delete-collection-title" className="text-lg font-bold text-slate-900">
              Delete Collection
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete <span className="font-semibold text-slate-900">&ldquo;{collection?.name}&rdquo;</span>?
            </p>
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              Note: This will <strong>not</strong> delete any notes inside this collection. Your notes will remain safe in active notes as unassigned.
            </p>

            {deleteError && (
              <div role="alert" className="mt-3 text-xs text-rose-600">
                {deleteError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteSubmit}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? "Deleting..." : "Delete Collection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
