import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import EditorToolbar from "./EditorToolbar.jsx";
import { normalizeEditorContent } from "../../constants/editor.js";

/**
 * TiptapEditor component.
 * Integrates Tiptap rich-text editor with explicit manual-save support.
 *
 * @param {object} props
 * @param {object} props.initialContent - Server note content JSON
 * @param {boolean} [props.editable=true] - Whether the editor is interactive
 * @param {function} props.onChange - Called when content changes: (json) => void
 * @param {function} [props.onEditorReady] - Called once editor is created: (editor) => void
 */
export default function TiptapEditor({
  initialContent,
  editable = true,
  onChange,
  onEditorReady,
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        link: false,
        underline: false,
      }),
    ],
    content: normalizeEditorContent(initialContent),
    editable,
    editorProps: {
      attributes: {
        class:
          "prose max-w-none focus:outline-none min-h-[320px] p-4 text-stone-900 leading-relaxed font-sans",
        role: "textbox",
        "aria-label": "Note content",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (onChange) {
        onChange(currentEditor.getJSON());
      }
    },
  });

  // Notify parent of editor instance and cleanup on unmount
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
      return () => {
        onEditorReady(null);
      };
    }
  }, [editor, onEditorReady]);

  // Sync editable prop when saving or disabling
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  return (
    <div className="flex flex-col border border-stone-200 rounded-lg bg-white shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500">
      <EditorToolbar editor={editor} disabled={!editable} />
      <div className="relative cursor-text flex-1">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
