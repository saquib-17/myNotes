import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth.js";
import { CollectionsContext } from "./collectionsContextDef.js";
import {
  fetchCollections,
  createCollection as apiCreateCollection,
  updateCollection as apiUpdateCollection,
  deleteCollection as apiDeleteCollection,
} from "../services/notes.service.js";

export function CollectionsProvider({ children }) {
  const { user, getCsrfToken } = useAuth();
  const [collections, setCollections] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshCollections = useCallback(
    async (signal) => {
      if (!user) {
        setCollections([]);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchCollections({ signal });
        setCollections(data.collections || []);
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) return;
        setError(err?.message || "Failed to load collections");
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
    refreshCollections(controller.signal);
    return () => controller.abort();
  }, [refreshCollections]);

  const createCollection = useCallback(
    async (name) => {
      const csrfToken = await getCsrfToken();
      const result = await apiCreateCollection({ name, csrfToken });
      await refreshCollections();
      return result;
    },
    [getCsrfToken, refreshCollections]
  );

  const updateCollection = useCallback(
    async (id, name) => {
      const csrfToken = await getCsrfToken();
      const result = await apiUpdateCollection(id, { name, csrfToken });
      await refreshCollections();
      return result;
    },
    [getCsrfToken, refreshCollections]
  );

  const deleteCollection = useCallback(
    async (id) => {
      const csrfToken = await getCsrfToken();
      await apiDeleteCollection(id, { csrfToken });
      await refreshCollections();
    },
    [getCsrfToken, refreshCollections]
  );

  const value = {
    collections,
    isLoading,
    error,
    refreshCollections,
    createCollection,
    updateCollection,
    deleteCollection,
  };

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
}

