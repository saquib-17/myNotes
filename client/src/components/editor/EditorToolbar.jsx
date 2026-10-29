/**
 * Accessible rich-text formatting toolbar for Tiptap editor.
 * Provides controls strictly matching the Stage 5A content schema contract.
 * Professional Developer Navy & Royal Blue aesthetic.
 */

export default function EditorToolbar({ editor, disabled = false }) {
  if (!editor) {
    return null;
  }

  const btnClass = (isActive, canAct = true) =>
    `inline-flex items-center justify-center rounded-lg px-2 py-0.5 text-xs font-medium transition-colors border ${
      isActive
        ? "bg-[#EEF3FF] text-[#2948D8] border-[#A5B4FC] font-semibold"
        : "bg-white text-[#374151] border-[#E6EAF2] hover:bg-[#F7F9FD] hover:text-[#111827]"
    } ${
      !canAct || disabled
        ? "opacity-40 cursor-not-allowed pointer-events-none"
        : "cursor-pointer"
    } focus:outline-none focus:ring-2 focus:ring-[#A5B4FC] focus:ring-offset-1`;

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-1 p-2 bg-[#F7F9FD] border-b border-[#E6EAF2] rounded-t-2xl"
    >
      {/* Block Formats */}
      <div className="flex items-center gap-1 border-r border-[#E6EAF2] pr-1.5 mr-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={btnClass(editor.isActive("paragraph"))}
          aria-label="Normal text"
          aria-pressed={editor.isActive("paragraph")}
        >
          Normal
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={btnClass(editor.isActive("heading", { level: 1 }))}
          aria-label="Heading 1"
          aria-pressed={editor.isActive("heading", { level: 1 })}
        >
          H1
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btnClass(editor.isActive("heading", { level: 2 }))}
          aria-label="Heading 2"
          aria-pressed={editor.isActive("heading", { level: 2 })}
        >
          H2
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btnClass(editor.isActive("heading", { level: 3 }))}
          aria-label="Heading 3"
          aria-pressed={editor.isActive("heading", { level: 3 })}
        >
          H3
        </button>
      </div>

      {/* Inline Marks */}
      <div className="flex items-center gap-1 border-r border-[#E6EAF2] pr-1.5 mr-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btnClass(editor.isActive("bold"))}
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
        >
          <span className="font-bold">B</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btnClass(editor.isActive("italic"))}
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
        >
          <span className="italic">I</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={btnClass(editor.isActive("strike"))}
          aria-label="Strikethrough"
          aria-pressed={editor.isActive("strike")}
        >
          <span className="line-through">S</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={btnClass(editor.isActive("code"))}
          aria-label="Inline code"
          aria-pressed={editor.isActive("code")}
        >
          <code className="font-mono text-[11px]">&lt;/&gt;</code>
        </button>
      </div>

      {/* Lists & Containers */}
      <div className="flex items-center gap-1 border-r border-[#E6EAF2] pr-1.5 mr-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnClass(editor.isActive("bulletList"))}
          aria-label="Bullet list"
          aria-pressed={editor.isActive("bulletList")}
        >
          • List
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btnClass(editor.isActive("orderedList"))}
          aria-label="Numbered list"
          aria-pressed={editor.isActive("orderedList")}
        >
          1. List
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btnClass(editor.isActive("blockquote"))}
          aria-label="Blockquote"
          aria-pressed={editor.isActive("blockquote")}
        >
          Quote
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={btnClass(editor.isActive("codeBlock"))}
          aria-label="Code block"
          aria-pressed={editor.isActive("codeBlock")}
        >
          Code Block
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className={btnClass(false)}
          aria-label="Horizontal rule"
        >
          Divider
        </button>
      </div>

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
          className={btnClass(false, editor.can().undo())}
          aria-label="Undo"
        >
          Undo
        </button>

        <button
          type="button"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
          className={btnClass(false, editor.can().redo())}
          aria-label="Redo"
        >
          Redo
        </button>
      </div>
    </div>
  );
}
