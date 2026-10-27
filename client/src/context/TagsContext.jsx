import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth.js";
import { TagsContext } from "./tagsContextDef.js";
import {
  fetchTags,
  createTag as apiCreateTag,
  updateTag as apiUpdateTag,
  deleteTag as apiDeleteTag,
} from "../services/notes.service.js";

export function TagsProvider({ children }) {
  const { user, getCsrfToken } = useAuth();
  const [tags, setTags] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshTags = useCallback(
    async (signal) => {
      if (!user) {
        setTags([]);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchTags({ signal });
        setTags(data || []);
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) return;
        setError(err?.message || "Failed to load tags");
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [user]
  );

  useEffect(() => {
    const controller = new AbortController();
    refreshTags(controller.signal);
    return () => controller.abort();
  }, [refreshTags]);

  const createTag = useCallback(
    async (name) => {
      const csrfToken = await getCsrfToken();
      const result = await apiCreateTag({ name, csrfToken });
      await refreshTags();
      return result;
    },
    [getCsrfToken, refreshTags]
  );

  const updateTag = useCallback(
    async (id, name) => {
      const csrfToken = await getCsrfToken();
      const result = await apiUpdateTag(id, { name, csrfToken });
      await refreshTags();
      return result;
    },
    [getCsrfToken, refreshTags]
  );

  const deleteTag = useCallback(
    async (id) => {
      const csrfToken = await getCsrfToken();
      await apiDeleteTag(id, { csrfToken });
      await refreshTags();
    },
    [getCsrfToken, refreshTags]
  );

  const value = {
    tags,
    isLoading,
    error,
    refreshTags,
    createTag,
    updateTag,
    deleteTag,
  };

  return (
    <TagsContext.Provider value={value}>
      {children}
    </TagsContext.Provider>
  );
}

