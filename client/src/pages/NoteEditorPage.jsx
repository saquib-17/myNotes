import { useState, useEffect, useRef, useCallback, useContext } from "react";
import {
  useParams,
  useNavigate,
  Link,
  useOutletContext,
  useBlocker,
  UNSAFE_DataRouterContext,
} from "react-router-dom";
import { useAuth } from "../context/useAuth.js";
import {
  fetchNoteById,
  updateNote,
  pinNote,
  unpinNote,
  trashNote,
  validateClientNote,
  NOTE_LIMITS,
} from "../services/notes.service.js";
import TiptapEditor from "../components/editor/TiptapEditor.jsx";
import {
  CANONICAL_EMPTY_DOC,
  normalizeEditorContent,
} from "../constants/editor.js";
import LoadingState from "../components/LoadingState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { deepEqual } from "../utils/deepEqual.js";

/**
 * Inner router blocker component that conditionally invokes useBlocker
 * when running within a React Router Data Router context.
 */
function DataRouterBlocker({ shouldBlock, onBlockerStateChange }) {
  const blocker = useBlocker(shouldBlock);
  useEffect(() => {
    onBlockerStateChange(blocker);
  }, [blocker, onBlockerStateChange]);
  return null;
}

/**
 * Safe blocker bridge that avoids calling useBlocker in non-data-router environments.
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
 * NoteEditorPage - Full rich-text editor view for an individual note.
 * Features explicit manual saving, read-only freeze during in-flight saves,
 * calm predictable save status, version-conflict handling, and router navigation blocking.
 */
export default function NoteEditorPage() {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const { getCsrfToken } = useAuth();
  const outlet = useOutletContext();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);

  // Note data & version
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(CANONICAL_EMPTY_DOC);
  const [expectedVersion, setExpectedVersion] = useState(1);
  const [updatedAt, setUpdatedAt] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [isPinning, setIsPinning] = useState(false);

  // Saved baseline for dirty state detection
  const savedBaselineRef = useRef({ title: "", content: CANONICAL_EMPTY_DOC });
  const [isDirty, setIsDirty] = useState(false);

  // Editor instance reference
  const editorInstanceRef = useRef(null);

  // Manual save state: 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict' | 'expired'
  const [saveStatus, setSaveStatus] = useState("saved");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [conflict, setConflict] = useState(false);

  // Conflict resolution helpers
  const [copyFeedback, setCopyFeedback] = useState("");
  const [showCopyFallback, setShowCopyFallback] = useState(false);
  const [showReloadConfirm, setShowReloadConfirm] = useState(false);

  // Trash state & modal
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);
  const [trashError, setTrashError] = useState(null);

  // Navigation blocker state
  const [routerBlocker, setRouterBlocker] = useState(null);
  const [showFallbackUnsavedModal, setShowFallbackUnsavedModal] = useState(false);
  const [fallbackTargetLocation, setFallbackTargetLocation] = useState(null);

  // Stale response guard ref: prevents previous note's responses from overwriting current note
  const loadGenerationRef = useRef(0);

  // Publish dirty and saving state to AppLayout shell
  useEffect(() => {
    if (outlet?.setEditorDirty) {
      outlet.setEditorDirty(isDirty);
    }
    if (outlet?.setEditorSaving) {
      outlet.setEditorSaving(isSaving);
    }
    return () => {
      if (outlet?.setEditorDirty) outlet.setEditorDirty(false);
      if (outlet?.setEditorSaving) outlet.setEditorSaving(false);
    };
  }, [isDirty, isSaving, outlet]);

  // Deep comparison against confirmed saved baseline
  const computeIsDirty = useCallback((curTitle, curContent) => {
    const baseline = savedBaselineRef.current;
    if (!baseline) return false;
    const titleChanged = curTitle !== baseline.title;
    const contentChanged = !deepEqual(
      normalizeEditorContent(curContent),
      normalizeEditorContent(baseline.content)
    );
    return titleChanged || contentChanged;
  }, []);

  // Load note from server
  const loadNote = useCallback(
    async (signal) => {
      const currentGen = ++loadGenerationRef.current;
      setIsLoading(true);
      setLoadError(null);
      setIsNotFound(false);
      setConflict(false);
      setSaveError(null);

      try {
        const data = await fetchNoteById(noteId, { signal });
        if (loadGenerationRef.current !== currentGen) return;

        const loadedTitle = data.title || "Untitled note";
        const loadedContent = normalizeEditorContent(data.content);

        setTitle(loadedTitle);
        setContent(loadedContent);
        setExpectedVersion(data.version);
        setUpdatedAt(data.updatedAt);
        setIsPinned(Boolean(data.pinned));

        savedBaselineRef.current = {
          title: loadedTitle,
          content: loadedContent,
        };

        setIsDirty(false);
        setSaveStatus("saved");

        if (editorInstanceRef.current) {
          editorInstanceRef.current.commands.setContent(loadedContent, {
            emitUpdate: false,
          });
        }
      } catch (err) {
        if (loadGenerationRef.current !== currentGen) return;
        if (err.name === "AbortError") return;
        if (err.status === 404) {
          setIsNotFound(true);
        } else {
          setLoadError(err?.message || "Failed to load note.");
        }
      } finally {
        if (loadGenerationRef.current === currentGen) {
          setIsLoading(false);
        }
      }
    },
    [noteId]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadNote(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadNote]);

  // Title change handler
  const handleTitleChange = (e) => {
    if (isSaving || isTrashing) return;
    const newTitle = e.target.value;
    setTitle(newTitle);
    const dirty = computeIsDirty(newTitle, content);
    setIsDirty(dirty);
    if (dirty) {
      if (saveStatus === "saved") setSaveStatus("unsaved");
    } else {
      if (saveStatus === "unsaved") setSaveStatus("saved");
    }
  };

  // Body content change handler from Tiptap editor
  const handleContentChange = (newContent) => {
    if (isSaving || isTrashing) return;
    setContent(newContent);
    const dirty = computeIsDirty(title, newContent);
    setIsDirty(dirty);
    if (dirty) {
      if (saveStatus === "saved") setSaveStatus("unsaved");
    } else {
      if (saveStatus === "unsaved") setSaveStatus("saved");
    }
  };

  // Explicit Save Action
  const handleSave = useCallback(async () => {
    if (isSaving || isTrashing || !isDirty || conflict) return;

    // Client-side limits validation
    try {
      validateClientNote(title, content);
    } catch (validationErr) {
      setSaveStatus("error");
      setSaveError(validationErr.message);
      return;
    }

    setIsSaving(true);
    setSaveStatus("saving");
    setSaveError(null);
    const currentGen = loadGenerationRef.current;

    try {
      const csrfToken = await getCsrfToken();
      const updated = await updateNote(noteId, {
        title,
        content,
        expectedVersion,
        csrfToken,
      });

      if (loadGenerationRef.current !== currentGen) return;

      const updatedContent = normalizeEditorContent(updated.content);
      const updatedTitle = updated.title || "Untitled note";

      // Reconcile state to server canonical values
      setTitle(updatedTitle);
      setContent(updatedContent);
      setExpectedVersion(updated.version);
      setUpdatedAt(updated.updatedAt);
      if (typeof updated.pinned === "boolean") {
        setIsPinned(updated.pinned);
      }

      savedBaselineRef.current = {
        title: updatedTitle,
        content: updatedContent,
      };

      setIsDirty(false);
      setSaveStatus("saved");
      setSaveError(null);
      setConflict(false);
    } catch (err) {
      if (loadGenerationRef.current !== currentGen) return;

      if (err.status === 409 || err.code === "NOTE_VERSION_CONFLICT") {
        setConflict(true);
        setSaveStatus("conflict");
        setSaveError(
          "Another session or process has saved a newer version of this note. Your local edits are preserved."
        );
      } else if (err.status === 401 || err.code === "UNAUTHENTICATED") {
        setSaveStatus("expired");
        setSaveError(
          "Your session has expired. Copy your draft below before signing back in."
        );
      } else {
        setSaveStatus("error");
        setSaveError(
          err?.message || "Failed to save note. Your edits are preserved."
        );
      }
    } finally {
      if (loadGenerationRef.current === currentGen) {
        setIsSaving(false);
      }
    }
  }, [
    isSaving,
    isTrashing,
    isDirty,
    conflict,
    title,
    content,
    expectedVersion,
    getCsrfToken,
    noteId,
  ]);

  // Pin/Unpin action
  const handleTogglePin = async () => {
    if (isPinning || isTrashing) return;
    setIsPinning(true);
    const newPinned = !isPinned;
    setIsPinned(newPinned);

    try {
      const csrfToken = await getCsrfToken();
      if (newPinned) {
        await pinNote(noteId, { csrfToken });
      } else {
        await unpinNote(noteId, { csrfToken });
      }
    } catch (err) {
      setIsPinned(!newPinned);
      setSaveError(err?.message || "Failed to update pin status.");
    } finally {
      setIsPinning(false);
    }
  };

  // Keyboard shortcut: Ctrl+S (Windows/Linux) or Cmd+S (macOS)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        // Ignore during active IME composition
        if (e.isComposing) return;
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSave]);

  // Browser beforeunload protection for tab close / reload while dirty
  useEffect(() => {
    if (!isDirty || isTrashing) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, isTrashing]);

  // Conflict Resolution: Copy Draft
  const handleCopyDraft = async () => {
    const plainText = editorInstanceRef.current?.getText() || "";
    const copyPayload = `Title: ${title}\n\n${plainText}`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(copyPayload);
        setCopyFeedback("Draft copied to clipboard!");
        setTimeout(() => setCopyFeedback(""), 3000);
      } else {
        setShowCopyFallback(true);
      }
    } catch {
      setShowCopyFallback(true);
    }
  };

  // Conflict Resolution: Discard & Reload Server Note
  const handleConfirmReload = async () => {
    setShowReloadConfirm(false);
    await loadNote();
  };

  // Trash Note Action
  const handleConfirmTrash = async () => {
    setIsTrashing(true);
    setTrashError(null);

    try {
      const csrfToken = await getCsrfToken();
      await trashNote(noteId, {
        expectedVersion,
        csrfToken,
      });

      // Clear dirty state to prevent navigation warning and redirect cleanly
      setIsDirty(false);
      setShowTrashModal(false);
      navigate("/notes");
    } catch (err) {
      setIsTrashing(false);
      if (err.status === 409 || err.code === "NOTE_VERSION_CONFLICT") {
        setShowTrashModal(false);
        setConflict(true);
        setSaveStatus("conflict");
      } else {
        setTrashError(
          err?.message ||
            "Could not move note to trash. Your content remains intact."
        );
      }
    }
  };

  // Navigation Guard predicate
  const shouldBlockNav = useCallback(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      !isTrashing &&
      currentLocation.pathname !== nextLocation.pathname,
    [isDirty, isTrashing]
  );

  // Navigation Guard confirmation handlers
  const isNavBlocked =
    (routerBlocker && routerBlocker.state === "blocked") ||
    showFallbackUnsavedModal;

  const handleStayOnPage = () => {
    if (routerBlocker?.state === "blocked") {
      routerBlocker.reset();
    }
    setShowFallbackUnsavedModal(false);
    setFallbackTargetLocation(null);
  };

  const handleDiscardAndLeave = () => {
    if (routerBlocker?.state === "blocked") {
      routerBlocker.proceed();
    } else {
      setShowFallbackUnsavedModal(false);
      navigate(fallbackTargetLocation || "/notes");
    }
  };

  const handleBackToNotes = () => {
    if (isDirty && !isTrashing) {
      if (routerBlocker?.state === "blocked") {
        return;
      }
      setFallbackTargetLocation("/notes");
      setShowFallbackUnsavedModal(true);
      return;
    }
    navigate("/notes");
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <LoadingState message="Loading note..." />
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 mb-2">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-stone-900">Note Not Found</h1>
        <p className="text-sm text-stone-600">
          This note does not exist, belongs to another user, or has been moved to trash.
        </p>
        <div className="pt-2">
          <Link
            to="/notes"
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Return to Notes
          </Link>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <ErrorState
          title="Could not open note"
          message={loadError}
          onRetry={() => loadNote()}
        />
        <div className="mt-4 text-center">
          <Link
            to="/notes"
            className="text-sm font-medium text-teal-700 hover:text-teal-900"
          >
            &larr; Back to notes list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Safe router navigation blocker bridge */}
      <SafeRouterBlocker
        shouldBlock={shouldBlockNav}
        onBlockerStateChange={setRouterBlocker}
      />

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackToNotes}
            aria-label="Back to notes"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 py-1.5 px-2.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            <span>Notes</span>
          </button>

          {/* Status Badge */}
          <div className="flex items-center gap-1.5 text-xs">
            {isSaving ? (
              <span className="inline-flex items-center gap-1 text-teal-700 font-medium">
                <svg
                  className="h-3.5 w-3.5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving...
              </span>
            ) : conflict ? (
              <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Version conflict
              </span>
            ) : saveStatus === "error" ? (
              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Save failed
              </span>
            ) : saveStatus === "expired" ? (
              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Session expired
              </span>
            ) : isDirty ? (
              <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Unsaved changes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-stone-500 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Saved (v{expectedVersion})
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Pin / Unpin Button */}
          <button
            type="button"
            disabled={isPinning || isTrashing}
            onClick={handleTogglePin}
            aria-label={isPinned ? "Unpin note" : "Pin note"}
            aria-pressed={isPinned}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg border transition-colors ${
              isPinned
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900"
            }`}
          >
            <svg
              className={`h-3.5 w-3.5 ${isPinned ? "fill-amber-500 text-amber-700" : "fill-none text-stone-400"}`}
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
            <span>{isPinned ? "Pinned" : "Pin"}</span>
          </button>

          {/* Trash Button */}
          <button
            type="button"
            disabled={isSaving || isTrashing}
            onClick={() => setShowTrashModal(true)}
            aria-label="Trash this note"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 py-1.5 px-3 rounded-lg border border-red-200 bg-white hover:bg-red-50 disabled:opacity-40"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
            <span>Trash</span>
          </button>

          {/* Explicit Manual Save Button */}
          <button
            type="button"
            disabled={isSaving || !isDirty || conflict}
            onClick={handleSave}
            className={`inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
              isSaving || !isDirty || conflict
                ? "opacity-50 cursor-not-allowed"
                : "cursor-pointer"
            }`}
          >
            {isSaving ? "Saving..." : "Save note"}
          </button>
        </div>
      </div>

      {/* Version Conflict Alert Banner */}
      {conflict && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-3"
        >
          <div className="flex items-start gap-2.5">
            <svg
              className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-semibold text-amber-950">Conflict Detected</p>
              <p className="mt-0.5 text-amber-800">
                Another session or process has saved a newer version of this note.
                Your local edits are preserved here and have <strong>not</strong> been overwritten.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleCopyDraft}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
            >
              Copy local draft
            </button>
            {copyFeedback && (
              <span className="text-xs font-medium text-emerald-700">
                {copyFeedback}
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowReloadConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Discard and reload latest
            </button>
          </div>
        </div>
      )}

      {/* Save Error Alert Banner */}
      {saveStatus === "error" && saveError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start justify-between gap-3"
        >
          <div>
            <p className="font-semibold">Save failed</p>
            <p className="mt-0.5 text-red-700">{saveError}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={handleSave}
              className="text-xs font-semibold text-red-700 hover:text-red-900 underline"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              className="text-xs text-stone-500 hover:text-stone-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Session Expired Alert Banner */}
      {saveStatus === "expired" && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-3"
        >
          <div>
            <p className="font-semibold">Session Expired</p>
            <p className="mt-0.5 text-red-700">
              Your session has expired. Your current edits are preserved in memory.
              Please copy your draft below before signing back in.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleCopyDraft}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-100 border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-200"
            >
              Copy local draft
            </button>
            {copyFeedback && (
              <span className="text-xs font-medium text-emerald-700">
                {copyFeedback}
              </span>
            )}
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Go to sign in
            </Link>
          </div>
        </div>
      )}

      {/* Note Title Input */}
      <div>
        <label htmlFor="note-title-input" className="sr-only">
          Note Title
        </label>
        <input
          id="note-title-input"
          type="text"
          value={title}
          disabled={isSaving || isTrashing}
          onChange={handleTitleChange}
          maxLength={NOTE_LIMITS.MAX_TITLE_LENGTH}
          placeholder="Untitled note"
          className="w-full text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 bg-transparent border-0 border-b border-transparent focus:border-teal-500 focus:outline-none focus:ring-0 pb-1 placeholder-stone-300 disabled:opacity-60"
        />
        <div className="flex items-center justify-between text-xs text-stone-400 mt-1">
          <span>
            {title.length} / {NOTE_LIMITS.MAX_TITLE_LENGTH} characters
          </span>
          {updatedAt && (
            <span>Last saved: {new Date(updatedAt).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Rich-Text Editing Surface (read-only while saving or trashing) */}
      <TiptapEditor
        initialContent={content}
        editable={!isSaving && !isTrashing}
        onChange={handleContentChange}
        onEditorReady={(editor) => {
          editorInstanceRef.current = editor;
        }}
      />

      {/* Copy Fallback Modal */}
      {showCopyFallback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h2 className="text-base font-semibold text-stone-900">
              Copy Draft Text
            </h2>
            <p className="text-xs text-stone-500">
              Select and copy your local draft text manually below:
            </p>
            <textarea
              readOnly
              rows={8}
              value={`Title: ${title}\n\n${editorInstanceRef.current?.getText() || ""}`}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 p-3 font-mono text-xs text-stone-900 focus:outline-none"
              onClick={(e) => e.target.select()}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowCopyFallback(false)}
                className="rounded-lg bg-stone-800 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard & Reload Confirmation Modal */}
      {showReloadConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h2 className="text-base font-semibold text-stone-900">
              Discard unsaved edits?
            </h2>
            <p className="text-sm text-stone-600">
              Are you sure you want to discard your local unsaved edits and reload the
              latest version from the server? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReloadConfirm(false)}
                className="rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReload}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                Discard and Reload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Navigation Guard Modal */}
      {isNavBlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <svg
                className="h-6 w-6 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <h2 className="text-base font-semibold text-stone-900">
                Unsaved changes
              </h2>
            </div>
            <p className="text-sm text-stone-600">
              {isSaving
                ? "A save is currently in progress. Please wait for the save to complete before leaving, or stay on this page to preserve your edits."
                : "You have unsaved changes in this note. If you leave now, your changes will be discarded."}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleStayOnPage}
                className="rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Stay
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleDiscardAndLeave}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Discard changes and leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trash Note Confirmation Modal */}
      {showTrashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h2 className="text-base font-semibold text-stone-900">
              Move note to trash?
            </h2>
            <p className="text-sm text-stone-600">
              Are you sure you want to move this note to the trash?
            </p>
            {isDirty && (
              <p className="text-xs font-medium text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
                Warning: You have unsaved changes that will be lost.
              </p>
            )}
            {trashError && (
              <p className="text-xs font-medium text-red-600 bg-red-50 p-2.5 rounded border border-red-200">
                {trashError}
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isTrashing}
                onClick={() => setShowTrashModal(false)}
                className="rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isTrashing}
                onClick={handleConfirmTrash}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {isTrashing ? "Moving to trash..." : "Move to trash"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
