import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";
import { useTags } from "../context/useTags.js";
import {
  fetchTagNotes,
  createNote,
  pinNote,
  unpinNote,
  TAG_LIMITS,
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

export default function TagNotesPage() {
  const { tagId } = useParams();
  const navigate = useNavigate();
  const { getCsrfToken } = useAuth();
  const { tags, updateTag, deleteTag } = useTags();

  const [tag, setTag] = useState(null);
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

  // Sync tag from context or response
  useEffect(() => {
    const found = tags.find((t) => t.id === tagId);
    if (found) {
      setTag(found);
    }
  }, [tags, tagId]);

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
        const data = await fetchTagNotes(tagId, {
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
        if (data.tag) {
          setTag(data.tag);
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
          setError(err?.message || "Could not load tag notes from server.");
        }
      } finally {
        if (fetchGenerationRef.current === currentGen && !signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [tagId, activeQuery, offset]
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
        tags: tag?.name ? [tag.name] : [],
        csrfToken,
      });

      navigate(`/notes/${newNote.id}`);
    } catch (err) {
      setCreateError(err?.message || "Failed to create note in this tag.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleTogglePin = async (e, note) => {
    e.preventDefault();
    e.stopPropagation();

    if (pinningId === note.id) return;
    setPinningId(note.id);
    setPinError(null);

    const willPin = !note.pinned;

    setNotes((prev) => {
      const updated = prev.map((n) =>
        n.id === note.id ? { ...n, pinned: willPin } : n
      );
      return updated.sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) {
          return a.pinned ? -1 : 1;
        }
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
    });

    try {
      const csrfToken = await getCsrfToken();
      if (willPin) {
        await pinNote(note.id, { csrfToken });
      } else {
        await unpinNote(note.id, { csrfToken });
      }
    } catch (err) {
      setNotes((prev) => {
        const reverted = prev.map((n) =>
          n.id === note.id ? { ...n, pinned: note.pinned } : n
        );
        return reverted.sort((a, b) => {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) {
            return a.pinned ? -1 : 1;
          }
          return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
      });
      setPinError(
        err?.message ||
          (willPin ? "Failed to pin note. Please try again." : "Failed to unpin note. Please try again.")
      );
    } finally {
      setPinningId(null);
    }
  };

  // Rename handlers
  const handleOpenRename = () => {
    setRenameInput(tag?.name || "");
    setRenameError(null);
    setShowRenameModal(true);
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    const trimmed = renameInput.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
      setRenameError("Tag name cannot be empty.");
      return;
    }
    if (trimmed.length > TAG_LIMITS.MAX_NAME_LENGTH) {
      setRenameError(`Tag name cannot exceed ${TAG_LIMITS.MAX_NAME_LENGTH} characters.`);
      return;
    }

    setIsRenaming(true);
    setRenameError(null);

    try {
      const updated = await updateTag(tagId, trimmed);
      setTag(updated);
      setShowRenameModal(false);
      loadNotes();
    } catch (err) {
      if (err?.code === "TAG_CONFLICT" || err?.status === 409) {
        setRenameError("A tag with this name already exists.");
      } else {
        setRenameError(err?.message || "Failed to rename tag.");
      }
    } finally {
      setIsRenaming(false);
    }
  };

  // Delete handlers
  const handleDeleteSubmit = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteTag(tagId);
      setShowDeleteModal(false);
      navigate("/notes");
    } catch (err) {
      setDeleteError(err?.message || "Failed to delete tag.");
      setIsDeleting(false);
    }
  };

  // Split into pinned and other notes
  const pinnedNotes = notes.filter((n) => Boolean(n.pinned));
  const otherNotes = notes.filter((n) => !n.pinned);

  if (isNotFound) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
          <h2 className="text-lg font-semibold text-slate-900">Tag not found</h2>
          <p className="mt-2 text-sm text-slate-500">
            This tag may have been deleted or is not accessible.
          </p>
          <div className="mt-6">
            <Link
              to="/notes"
              className="inline-flex items-center gap-2 rounded-lg bg-[#365CF5] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#2848D8] transition-colors"
            >
              Back to Notes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
      {/* Header with Title, Actions, and Rename/Delete controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-[#E6EAF2]">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-[#667085]">
            <Link to="/notes" className="hover:text-[#365CF5] transition-colors">
              Notes
            </Link>
            <span>/</span>
            <span className="text-[#344054]">Tags</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF3FF] text-[#2948D8] font-bold text-base">
                #
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-[#182230]">
                {tag?.name || "Tag"}
              </h1>
            </div>
            {tag && (
              <span className="inline-flex items-center rounded-full bg-[#F4F6FB] border border-[#E6EAF2] px-2.5 py-0.5 text-xs font-medium text-[#667085]">
                {total} {total === 1 ? "note" : "notes"}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenRename}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] shadow-xs hover:bg-[#F4F6FB] transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setShowDeleteModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-xs hover:bg-rose-50 hover:border-rose-300 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete tag
          </button>
          <button
            type="button"
            onClick={handleCreateNote}
            disabled={isCreating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#365CF5] px-3.5 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-[#2848D8] disabled:opacity-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            {isCreating ? "Creating..." : "New note"}
          </button>
        </div>
      </div>

      {createError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center justify-between">
          <span>{createError}</span>
          <button
            type="button"
            onClick={() => setCreateError(null)}
            className="text-rose-500 hover:text-rose-700 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {pinError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-center justify-between">
          <span>{pinError}</span>
          <button
            type="button"
            onClick={() => setPinError(null)}
            className="text-amber-600 hover:text-amber-800 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
        </div>
        <input
          type="text"
          value={searchInput}
          onChange={handleSearchChange}
          placeholder={`Search within #${tag?.name || "tag"}...`}
          className="block w-full rounded-xl border border-[#DCE3EF] bg-white py-2.5 pl-10 pr-10 text-sm text-[#182230] placeholder-[#8A94A6] shadow-2xs focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
        />
        {searchInput && (
          <button
            type="button"
            onClick={handleClearSearch}
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* Note Lists */}
      {isLoading ? (
        <LoadingState message="Loading notes..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadNotes()} />
      ) : notes.length === 0 ? (
        <EmptyState
          title={activeQuery ? "No matching notes found" : "No notes with this tag yet"}
          description={
            activeQuery
              ? `No notes in #${tag?.name || "tag"} match "${activeQuery}".`
              : `Create your first note in #${tag?.name || "tag"} to start organizing.`
          }
          actionLabel={activeQuery ? "Clear search" : "Create note"}
          onAction={activeQuery ? handleClearSearch : handleCreateNote}
        />
      ) : (
        <div className="space-y-8">
          {/* Pinned section */}
          {pinnedNotes.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-600">
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Pinned ({pinnedNotes.length})
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onTogglePin={(e) => handleTogglePin(e, note)}
                    isPinning={pinningId === note.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other notes section */}
          {otherNotes.length > 0 && (
            <div>
              {pinnedNotes.length > 0 && (
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Other notes ({otherNotes.length})
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {otherNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onTogglePin={(e) => handleTogglePin(e, note)}
                    isPinning={pinningId === note.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pagination */}
          {(offset > 0 || hasMore) && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-slate-600">
              <button
                type="button"
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                disabled={offset === 0}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">
                Showing {offset + 1} - {Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <button
                type="button"
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                disabled={!hasMore}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Rename Tag</h3>
            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Tag Name</label>
                <input
                  type="text"
                  maxLength={TAG_LIMITS.MAX_NAME_LENGTH}
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-sm text-[#182230] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
                  autoFocus
                />
                <div className="mt-1 flex justify-between text-2xs text-[#8A94A6]">
                  <span>Letters, numbers, dashes</span>
                  <span>{renameInput.length}/{TAG_LIMITS.MAX_NAME_LENGTH}</span>
                </div>
              </div>

              {renameError && (
                <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-600 font-medium border border-rose-200">
                  {renameError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  className="rounded-lg border border-[#DCE3EF] px-4 py-2 text-xs font-semibold text-[#344054] hover:bg-[#F4F6FB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRenaming}
                  className="rounded-lg bg-[#365CF5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2848D8] disabled:opacity-50 transition-colors"
                >
                  {isRenaming ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900">Delete Tag</h3>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-900">#{tag?.name}</strong>?
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Safety Guarantee:</span> Deleting this tag will remove the tag label from all associated notes. <strong>Your notes will NOT be deleted.</strong>
            </div>

            {deleteError && (
              <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-600 font-medium border border-rose-200">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={isDeleting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? "Deleting..." : "Delete tag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onTogglePin, isPinning }) {
  return (
    <Link
      to={`/notes/${note.id}`}
      className="group relative flex flex-col justify-between rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-2xs hover:border-[#365CF5]/40 hover:shadow-xs transition-all duration-150"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-[#182230] group-hover:text-[#365CF5] line-clamp-1 transition-colors">
            {note.title || "Untitled note"}
          </h3>
          <button
            type="button"
            onClick={onTogglePin}
            disabled={isPinning}
            title={note.pinned ? "Unpin note" : "Pin note"}
            aria-label={note.pinned ? "Unpin note" : "Pin note"}
            className={`-mr-1.5 -mt-1.5 flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              note.pinned
                ? "text-amber-500 hover:text-amber-600 bg-amber-50 hover:bg-amber-100"
                : "text-slate-300 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 focus:opacity-100"
            }`}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill={note.pinned ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={note.pinned ? "0" : "1.75"}
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500 line-clamp-3 leading-relaxed">
          {note.preview || <span className="italic text-slate-400">Empty note</span>}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
        {/* Tag pills */}
        {Array.isArray(note.tags) && note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {note.tags.map((t) => (
              <span
                key={t.id || t.name}
                className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-3xs font-medium text-slate-600"
              >
                #{t.name}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-2xs text-slate-400">
          <span>Updated {formatTimestamp(note.updatedAt)}</span>
          <span className="font-mono text-slate-400">v{note.version}</span>
        </div>
      </div>
    </Link>
  );
}
