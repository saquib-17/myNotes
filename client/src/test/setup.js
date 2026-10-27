import "@testing-library/jest-dom";

// Shims for ProseMirror / Tiptap in jsdom testing environment
if (typeof window !== "undefined") {
  if (!window.Range.prototype.getClientRects) {
    window.Range.prototype.getClientRects = () => [];
  }
  if (!window.Range.prototype.getBoundingClientRect) {
    window.Range.prototype.getBoundingClientRect = () => ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
    });
  }
  if (!window.scrollTo) {
    window.scrollTo = () => {};
  }
}

