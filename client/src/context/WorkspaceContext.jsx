import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./useAuth.js";
import { WorkspaceContext } from "./workspaceContextDef.js";
import {
  fetchWorkspaces,
  createWorkspace as apiCreateWorkspace,
  updateWorkspace as apiUpdateWorkspace,
  deleteWorkspace as apiDeleteWorkspace,
  setDefaultWorkspace as apiSetDefaultWorkspace,
  getStoredActiveWorkspaceId,
  setStoredActiveWorkspaceId,
} from "../services/notes.service.js";

export function WorkspaceProvider({ children }) {
  const { user, getCsrfToken } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => getStoredActiveWorkspaceId());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const resolveAndSetActive = useCallback((list, preferredId) => {
    if (!Array.isArray(list) || list.length === 0) {
      setActiveWorkspaceId(null);
      setStoredActiveWorkspaceId(null);
      return null;
    }

    // 1. Try preferred or previously stored ID
    const match = preferredId ? list.find((w) => w?.id === preferredId) : null;
    if (match) {
      setActiveWorkspaceId(match.id);
      setStoredActiveWorkspaceId(match.id);
      return match.id;
    }

    // 2. Fallback to default workspace
    const defaultWs = list.find((w) => w && (w.isDefault || w.is_default));
    if (defaultWs?.id) {
      setActiveWorkspaceId(defaultWs.id);
      setStoredActiveWorkspaceId(defaultWs.id);
      return defaultWs.id;
    }

    // 3. Fallback to first workspace in list
    const firstWs = list.find((w) => Boolean(w?.id));
    if (firstWs?.id) {
      setActiveWorkspaceId(firstWs.id);
      setStoredActiveWorkspaceId(firstWs.id);
      return firstWs.id;
    }

    setActiveWorkspaceId(null);
    setStoredActiveWorkspaceId(null);
    return null;
  }, []);

  const refreshWorkspaces = useCallback(
    async (signal) => {
      if (!user) {
        setWorkspaces([]);
        setActiveWorkspaceId(null);
        setStoredActiveWorkspaceId(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchWorkspaces({ signal });
        const list = Array.isArray(data?.workspaces)
          ? data.workspaces.filter((w) => Boolean(w && typeof w === "object" && w.id))
          : [];
        setWorkspaces(list);

        const currentStored = getStoredActiveWorkspaceId();
        resolveAndSetActive(list, currentStored);
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) return;
        setError(err?.message || "Failed to load workspaces");
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [user, resolveAndSetActive]
  );

  useEffect(() => {
    const controller = new AbortController();
    refreshWorkspaces(controller.signal);
    return () => controller.abort();
  }, [refreshWorkspaces]);

  const switchWorkspace = useCallback(
    (targetId) => {
      if (!targetId || targetId === activeWorkspaceId) return;
      const target = workspaces.find((w) => w?.id === targetId);
      if (!target) return;

      setActiveWorkspaceId(target.id);
      setStoredActiveWorkspaceId(target.id);

      // Trigger workspace-change notification for active subscribers
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("workspace-changed", { detail: { workspaceId: target.id } }));
      }
    },
    [activeWorkspaceId, workspaces]
  );

  const createNewWorkspace = useCallback(
    async (name) => {
      const csrfToken = await getCsrfToken();
      const result = await apiCreateWorkspace({ name, csrfToken });
      await refreshWorkspaces();
      if (result?.workspace?.id) {
        switchWorkspace(result.workspace.id);
      }
      return result;
    },
    [getCsrfToken, refreshWorkspaces, switchWorkspace]
  );

  const renameWorkspace = useCallback(
    async (id, name) => {
      const csrfToken = await getCsrfToken();
      const result = await apiUpdateWorkspace(id, { name, csrfToken });
      await refreshWorkspaces();
      return result;
    },
    [getCsrfToken, refreshWorkspaces]
  );

  const removeWorkspace = useCallback(
    async (id) => {
      if (!id) return;
      const csrfToken = await getCsrfToken();
      await apiDeleteWorkspace(id, { csrfToken });

      // If active workspace is deleted, switch back to default
      if (id === activeWorkspaceId) {
        const remaining = workspaces.filter((w) => w && w.id !== id);
        resolveAndSetActive(remaining, null);
      }
      await refreshWorkspaces();
    },
    [getCsrfToken, activeWorkspaceId, workspaces, resolveAndSetActive, refreshWorkspaces]
  );

  const setAsDefault = useCallback(
    async (id) => {
      if (!id) return;
      const csrfToken = await getCsrfToken();
      const result = await apiSetDefaultWorkspace(id, { csrfToken });
      await refreshWorkspaces();
      return result;
    },
    [getCsrfToken, refreshWorkspaces]
  );

  const activeWorkspace = useMemo(() => {
    if (!activeWorkspaceId || workspaces.length === 0) return null;
    return workspaces.find((w) => w?.id === activeWorkspaceId) || null;
  }, [activeWorkspaceId, workspaces]);

  const value = {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    isLoading,
    error,
    switchWorkspace,
    createNewWorkspace,
    renameWorkspace,
    removeWorkspace,
    setAsDefault,
    refreshWorkspaces,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

