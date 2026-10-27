import { useContext } from "react";
import { CollectionsContext } from "./collectionsContextDef.js";

const DEFAULT_COLLECTIONS_VALUE = {
  collections: [],
  isLoading: false,
  error: null,
  refreshCollections: async () => {},
  createCollection: async () => {},
  updateCollection: async () => {},
  deleteCollection: async () => {},
};

export function useCollections() {
  const context = useContext(CollectionsContext);
  return context || DEFAULT_COLLECTIONS_VALUE;
}

