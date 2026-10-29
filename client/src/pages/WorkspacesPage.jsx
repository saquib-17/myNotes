import { useState } from "react";
import { useWorkspace } from "../context/useWorkspace.js";
import { useOutletContext } from "react-router-dom";
import { WORKSPACE_LIMITS } from "../services/notes.service.js";

/**
 * WorkspacesPage - Full dedicated workspace management page.
 * Allows viewing, creating, renaming, switching, setting default, and deleting workspaces.
 */
export default function WorkspacesPage() {
  const {
    workspaces,
    activeWorkspaceId,
    isLoading,
    error: workspaceError,
    switchWorkspace,
    createNewWorkspace,
    renameWorkspace,
    removeWorkspace,
    setAsDefault,
  } = useWorkspace();

  const outletCtx = useOutletContext();
  const editorDirty = Boolean(outletCtx?.editorDirty);

  // Create state
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  // Inline rename state
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [renameError, setRenameError] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete modal state
  const [workspaceToDelete, setWorkspaceToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle Switch
  const handleSwitch = (ws) => {
    if (!ws?.id) return;
    if (ws.id === activeWorkspaceId) return;
    if (editorDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes. Discard changes and switch workspace?"
      );
      if (!confirmed) return;
    }
    switchWorkspace(ws.id);
  };

  // Handle Create
  const handleCreate = async (e) => {
    e.preventDefault();
    const trimmed = createName.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setCreateError("Workspace name cannot be empty.");
      return;
    }
    if (trimmed.length > WORKSPACE_LIMITS.MAX_NAME_LENGTH) {
      setCreateError(`Workspace name cannot exceed ${WORKSPACE_LIMITS.MAX_NAME_LENGTH} characters.`);
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      await createNewWorkspace(trimmed);
      setCreateName("");
    } catch (err) {
      if (err.status === 409 || err.code === "WORKSPACE_CONFLICT") {
        setCreateError("A workspace with this name already exists.");
      } else {
        setCreateError(err?.message || "Failed to create workspace.");
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Start Rename
  const startRename = (ws) => {
    if (!ws?.id) return;
    setEditingId(ws.id);
    setEditingName(ws.name || "");
    setRenameError(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingName("");
    setRenameError(null);
  };

  // Save Rename
  const handleRename = async (e) => {
    e.preventDefault();
    const trimmed = editingName.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setRenameError("Workspace name cannot be empty.");
      return;
    }
    if (trimmed.length > WORKSPACE_LIMITS.MAX_NAME_LENGTH) {
      setRenameError(`Workspace name cannot exceed ${WORKSPACE_LIMITS.MAX_NAME_LENGTH} characters.`);
      return;
    }

    setIsRenaming(true);
    setRenameError(null);
    try {
      await renameWorkspace(editingId, trimmed);
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      if (err.status === 409 || err.code === "WORKSPACE_CONFLICT") {
        setRenameError("A workspace with this name already exists.");
      } else {
        setRenameError(err?.message || "Failed to rename workspace.");
      }
    } finally {
      setIsRenaming(false);
    }
  };

  // Set Default
  const handleSetDefault = async (id) => {
    try {
      await setAsDefault(id);
    } catch (err) {
      alert(err?.message || "Failed to set default workspace.");
    }
  };

  // Confirm Delete
  const handleDelete = async () => {
    if (!workspaceToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await removeWorkspace(workspaceToDelete.id);
      setWorkspaceToDelete(null);
    } catch (err) {
      setDeleteError(err?.message || "Failed to delete workspace.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 max-w-4xl">
      <p className="text-xs sm:text-sm text-slate-600">
        Organize your work into focused workspaces.
      </p>

      {workspaceError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          {workspaceError}
        </div>
      )}

      {/* Create New Workspace Form */}
      <section aria-labelledby="create-workspace-heading" className="rounded-xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-2xs">
        <h2 id="create-workspace-heading" className="text-sm sm:text-base font-semibold text-slate-900">
          Create New Workspace
        </h2>
        <form onSubmit={handleCreate} className="mt-3 flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1">
            <input
              type="text"
              value={createName}
              onChange={(e) => {
                setCreateName(e.target.value);
                if (createError) setCreateError(null);
              }}
              placeholder="e.g. Placement Prep, College, Projects"
              maxLength={WORKSPACE_LIMITS.MAX_NAME_LENGTH}
              aria-label="New workspace name"
              disabled={isCreating}
              className="w-full rounded-lg border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs sm:text-sm text-[#182230] placeholder:text-[#8A94A6] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5] disabled:opacity-60"
            />
            {createError && (
              <p className="mt-1 text-xs text-rose-600 font-medium" role="alert">
                {createError}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isCreating || !createName.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-[#365CF5] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-[#2848D8] disabled:opacity-50 sm:self-start"
          >
            {isCreating ? "Creating…" : "Create Workspace"}
          </button>
        </form>
      </section>

      {/* Workspaces List */}
      <section aria-labelledby="workspaces-list-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="workspaces-list-heading" className="text-sm sm:text-base font-semibold text-[#182230]">
            Your Workspaces ({workspaces.length})
          </h2>
          {isLoading && (
            <span className="text-xs text-[#8A94A6]">Updating…</span>
          )}
        </div>

        <div className="grid gap-2.5">
          {workspaces.filter((ws) => Boolean(ws && ws.id)).map((ws) => {
            const isActive = ws.id === activeWorkspaceId;
            const isDefault = Boolean(ws.isDefault || ws.is_default);
            const isEditing = editingId === ws.id;
            const canDelete = !isDefault && workspaces.length > 1;

            return (
              <div
                key={ws.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3 sm:p-3.5 transition-all bg-white shadow-2xs ${
                  isActive
                    ? "border-[#365CF5] ring-1 ring-[#365CF5]"
                    : "border-[#E6EAF2] hover:border-[#365CF5]/40"
                }`}
              >
                {/* Workspace Info or Rename Input */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <form onSubmit={handleRename} className="flex flex-col sm:flex-row gap-2 max-w-md">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => {
                            setEditingName(e.target.value);
                            if (renameError) setRenameError(null);
                          }}
                          maxLength={WORKSPACE_LIMITS.MAX_NAME_LENGTH}
                          aria-label="Rename workspace"
                          autoFocus
                          disabled={isRenaming}
                          className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-1.5 text-sm text-[#182230] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
                        />
                        {renameError && (
                          <p className="mt-1 text-xs text-rose-600 font-medium" role="alert">
                            {renameError}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="submit"
                          disabled={isRenaming || !editingName.trim()}
                          className="rounded-xl bg-[#365CF5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2848D8] disabled:opacity-50 transition-colors"
                        >
                          {isRenaming ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          disabled={isRenaming}
                          className="rounded-xl border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F4F6FB] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#182230] truncate">
                        {ws.name}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center rounded-full bg-[#EEF3FF] px-2 py-0.5 text-xs font-semibold text-[#2948D8] border border-[#365CF5]/20">
                          Active
                        </span>
                      )}
                      {isDefault && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
                          Default
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Workspace Actions */}
                {!isEditing && (
                  <div className="flex flex-wrap items-center gap-2 sm:self-center">
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => handleSwitch(ws)}
                        className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition-colors"
                      >
                        Switch to
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startRename(ws)}
                      className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      Rename
                    </button>
                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(ws.id)}
                        className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        Set as Default
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          setWorkspaceToDelete(ws);
                          setDeleteError(null);
                        }}
                        className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      {workspaceToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-workspace-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 id="delete-workspace-dialog-title" className="text-lg font-bold text-slate-900">
              Delete Workspace: {workspaceToDelete.name}
            </h3>
            <p className="text-sm text-slate-600">
              Deleting this workspace will hide all its contents. Are you sure you want to delete <span className="font-semibold text-slate-900">{workspaceToDelete.name}</span>?
            </p>

            {deleteError && (
              <p className="text-xs text-rose-600 font-medium" role="alert">
                {deleteError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setWorkspaceToDelete(null)}
                disabled={isDeleting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              >
                {isDeleting ? "Deleting…" : "Yes, Delete Workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
