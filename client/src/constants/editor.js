/**
 * Constants and utility functions for Tiptap rich-text editor.
 */

/**
 * Canonical empty document used when initializing a blank editor.
 */
export const CANONICAL_EMPTY_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/**
 * Normalizes note content so the editor always receives a valid doc structure.
 * Handles both `[]` content from server and standard paragraph structures.
 *
 * @param {object} content
 * @returns {object}
 */
export function normalizeEditorContent(content) {
  if (!content || typeof content !== "object") {
    return CANONICAL_EMPTY_DOC;
  }
  if (content.type === "doc") {
    if (!content.content || (Array.isArray(content.content) && content.content.length === 0)) {
      return CANONICAL_EMPTY_DOC;
    }
    return content;
  }
  return CANONICAL_EMPTY_DOC;
}

