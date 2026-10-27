import { useContext } from "react";
import { TagsContext } from "./tagsContextDef.js";

const DEFAULT_TAGS_VALUE = {
  tags: [],
  isLoading: false,
  error: null,
  refreshTags: async () => {},
  createTag: async () => {},
  updateTag: async () => {},
  deleteTag: async () => {},
};

export function useTags() {
  const context = useContext(TagsContext);
  return context || DEFAULT_TAGS_VALUE;
}

