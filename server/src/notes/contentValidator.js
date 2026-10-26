/**
 * Authoritative ProseMirror / Tiptap schema validator and plain-text extractor
 * for Stage 5A rich-text content contract.
 *
 * Supported nodes:
 *   doc, paragraph, text, heading (levels 1-3), bulletList, orderedList,
 *   listItem, blockquote, codeBlock, hardBreak, horizontalRule.
 *
 * Supported text marks:
 *   bold, italic, strike, code.
 */

export const LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_CONTENT_BYTES: 256 * 1024, // 256 KiB
  MAX_TREE_DEPTH: 20,
  MAX_NODE_COUNT: 5000,
};

export class ValidationError extends Error {
  constructor(message, status = 400, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
    this.code = code;
  }
}

const ALLOWED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
]);

const ALLOWED_MARKS = new Set(['bold', 'italic', 'strike', 'code']);

/**
 * Validates and normalizes note title.
 * Surrounding whitespace is trimmed. If empty or whitespace-only,
 * returns 'Untitled note'.
 *
 * @param {any} title
 * @returns {string}
 */
export function validateAndNormalizeTitle(title) {
  if (typeof title !== 'string') {
    throw new ValidationError('Title must be a string.');
  }

  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return 'Untitled note';
  }

  if (trimmed.length > LIMITS.MAX_TITLE_LENGTH) {
    throw new ValidationError(
      `Title cannot exceed ${LIMITS.MAX_TITLE_LENGTH} characters.`
    );
  }

  return trimmed;
}

/**
 * Validates a mark object on a text node.
 *
 * @param {any} mark
 * @param {Set<string>} seenMarks
 */
function validateMark(mark, seenMarks) {
  if (!mark || typeof mark !== 'object' || Array.isArray(mark)) {
    throw new ValidationError('Each mark must be an object.');
  }

  const { type, attrs } = mark;

  if (typeof type !== 'string' || !ALLOWED_MARKS.has(type)) {
    throw new ValidationError(
      `Unsupported mark type: "${type}". Supported marks: bold, italic, strike, code.`
    );
  }

  if (seenMarks.has(type)) {
    throw new ValidationError(`Duplicate mark type "${type}" on text node.`);
  }
  seenMarks.add(type);

  // For bold, italic, strike, code, no custom attributes are permitted
  if (attrs && typeof attrs === 'object' && Object.keys(attrs).length > 0) {
    throw new ValidationError(`Mark "${type}" does not accept attributes.`);
  }

  for (const key of Object.keys(mark)) {
    if (key !== 'type' && key !== 'attrs') {
      throw new ValidationError(`Unknown property "${key}" in mark.`);
    }
  }
}

/**
 * Recursive schema validator for a ProseMirror/Tiptap node.
 *
 * @param {any} node
 * @param {string|null} parentType
 * @param {number} depth
 * @param {{ count: number }} counter
 */
function validateNode(node, parentType, depth, counter) {
  counter.count += 1;
  if (counter.count > LIMITS.MAX_NODE_COUNT) {
    throw new ValidationError(
      `Document exceeds maximum node count of ${LIMITS.MAX_NODE_COUNT}.`
    );
  }

  if (depth > LIMITS.MAX_TREE_DEPTH) {
    throw new ValidationError(
      `Document structure exceeds maximum depth of ${LIMITS.MAX_TREE_DEPTH}.`
    );
  }

  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new ValidationError('Invalid document node structure.');
  }

  const { type, attrs, content, marks, text } = node;

  if (typeof type !== 'string' || !ALLOWED_NODE_TYPES.has(type)) {
    throw new ValidationError(`Unsupported node type: "${type}".`);
  }

  // Reject unexpected top-level properties on any node
  const allowedKeys = new Set(['type', 'attrs', 'content', 'marks', 'text']);
  for (const key of Object.keys(node)) {
    if (!allowedKeys.has(key)) {
      throw new ValidationError(`Unknown property "${key}" on node of type "${type}".`);
    }
  }

  // Node-specific placement, attributes, and content rules
  switch (type) {
    case 'doc': {
      if (parentType !== null) {
        throw new ValidationError('"doc" node can only appear at the root.');
      }
      if (attrs !== undefined) {
        throw new ValidationError('"doc" node does not take attributes.');
      }
      if (content !== undefined) {
        if (!Array.isArray(content)) {
          throw new ValidationError('"content" of "doc" must be an array.');
        }
        for (const child of content) {
          validateNode(child, 'doc', depth + 1, counter);
        }
      }
      break;
    }

    case 'paragraph': {
      if (parentType !== 'doc' && parentType !== 'listItem' && parentType !== 'blockquote') {
        throw new ValidationError(
          `"paragraph" cannot be a direct child of "${parentType}".`
        );
      }
      if (attrs !== undefined && Object.keys(attrs || {}).length > 0) {
        throw new ValidationError('"paragraph" node does not accept custom attributes.');
      }
      if (content !== undefined) {
        if (!Array.isArray(content)) {
          throw new ValidationError('"content" of "paragraph" must be an array.');
        }
        for (const child of content) {
          validateNode(child, 'paragraph', depth + 1, counter);
        }
      }
      break;
    }

    case 'heading': {
      if (parentType !== 'doc' && parentType !== 'listItem' && parentType !== 'blockquote') {
        throw new ValidationError(
          `"heading" cannot be a direct child of "${parentType}".`
        );
      }
      if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
        throw new ValidationError('"heading" node requires attributes with a "level".');
      }
      const level = attrs.level;
      if (![1, 2, 3].includes(level)) {
        throw new ValidationError(
          `Heading level must be 1, 2, or 3. Received: ${JSON.stringify(level)}.`
        );
      }
      for (const k of Object.keys(attrs)) {
        if (k !== 'level') {
          throw new ValidationError(`Unknown attribute "${k}" on heading node.`);
        }
      }
      if (content !== undefined) {
        if (!Array.isArray(content)) {
          throw new ValidationError('"content" of "heading" must be an array.');
        }
        for (const child of content) {
          validateNode(child, 'heading', depth + 1, counter);
        }
      }
      break;
    }

    case 'bulletList': {
      if (parentType !== 'doc' && parentType !== 'listItem' && parentType !== 'blockquote') {
        throw new ValidationError(
          `"bulletList" cannot be a direct child of "${parentType}".`
        );
      }
      if (attrs !== undefined && Object.keys(attrs || {}).length > 0) {
        throw new ValidationError('"bulletList" node does not take attributes.');
      }
      if (content !== undefined) {
        if (!Array.isArray(content)) {
          throw new ValidationError('"content" of "bulletList" must be an array.');
        }
        for (const child of content) {
          if (child?.type !== 'listItem') {
            throw new ValidationError(
              `"bulletList" children must be "listItem", received "${child?.type}".`
            );
          }
          validateNode(child, 'bulletList', depth + 1, counter);
        }
      }
      break;
    }

    case 'orderedList': {
      if (parentType !== 'doc' && parentType !== 'listItem' && parentType !== 'blockquote') {
        throw new ValidationError(
          `"orderedList" cannot be a direct child of "${parentType}".`
        );
      }
      if (attrs !== undefined) {
        if (typeof attrs !== 'object' || Array.isArray(attrs)) {
          throw new ValidationError('Attributes of "orderedList" must be an object.');
        }
        for (const k of Object.keys(attrs)) {
          if (k === 'start') {
            if (!Number.isInteger(attrs.start) || attrs.start < 1) {
              throw new ValidationError('orderedList "start" must be a positive integer.');
            }
          } else {
            throw new ValidationError(`Unknown attribute "${k}" on orderedList.`);
          }
        }
      }
      if (content !== undefined) {
        if (!Array.isArray(content)) {
          throw new ValidationError('"content" of "orderedList" must be an array.');
        }
        for (const child of content) {
          if (child?.type !== 'listItem') {
            throw new ValidationError(
              `"orderedList" children must be "listItem", received "${child?.type}".`
            );
          }
          validateNode(child, 'orderedList', depth + 1, counter);
        }
      }
      break;
    }

    case 'listItem': {
      if (parentType !== 'bulletList' && parentType !== 'orderedList') {
        throw new ValidationError(
          `"listItem" can only appear inside a "bulletList" or "orderedList", not "${parentType}".`
        );
      }
      if (attrs !== undefined && Object.keys(attrs || {}).length > 0) {
        throw new ValidationError('"listItem" node does not take attributes.');
      }
      if (content !== undefined) {
        if (!Array.isArray(content)) {
          throw new ValidationError('"content" of "listItem" must be an array.');
        }
        for (const child of content) {
          validateNode(child, 'listItem', depth + 1, counter);
        }
      }
      break;
    }

    case 'blockquote': {
      if (parentType !== 'doc' && parentType !== 'listItem' && parentType !== 'blockquote') {
        throw new ValidationError(
          `"blockquote" cannot be a direct child of "${parentType}".`
        );
      }
      if (attrs !== undefined && Object.keys(attrs || {}).length > 0) {
        throw new ValidationError('"blockquote" node does not take attributes.');
      }
      if (content !== undefined) {
        if (!Array.isArray(content)) {
          throw new ValidationError('"content" of "blockquote" must be an array.');
        }
        for (const child of content) {
          validateNode(child, 'blockquote', depth + 1, counter);
        }
      }
      break;
    }

    case 'codeBlock': {
      if (parentType !== 'doc' && parentType !== 'listItem' && parentType !== 'blockquote') {
        throw new ValidationError(
          `"codeBlock" cannot be a direct child of "${parentType}".`
        );
      }
      if (attrs !== undefined) {
        if (typeof attrs !== 'object' || Array.isArray(attrs)) {
          throw new ValidationError('Attributes of "codeBlock" must be an object.');
        }
        for (const k of Object.keys(attrs)) {
          if (k === 'language') {
            if (typeof attrs.language !== 'string' || attrs.language.length > 50) {
              throw new ValidationError('codeBlock "language" must be a string up to 50 chars.');
            }
          } else {
            throw new ValidationError(`Unknown attribute "${k}" on codeBlock.`);
          }
        }
      }
      if (content !== undefined) {
        if (!Array.isArray(content)) {
          throw new ValidationError('"content" of "codeBlock" must be an array.');
        }
        for (const child of content) {
          if (child?.type !== 'text') {
            throw new ValidationError('Children of "codeBlock" must be "text" nodes.');
          }
          if (child?.marks && child.marks.length > 0) {
            throw new ValidationError('Text nodes inside "codeBlock" cannot have marks.');
          }
          validateNode(child, 'codeBlock', depth + 1, counter);
        }
      }
      break;
    }

    case 'hardBreak': {
      if (parentType !== 'paragraph' && parentType !== 'heading') {
        throw new ValidationError(
          `"hardBreak" can only appear inside a paragraph or heading, not "${parentType}".`
        );
      }
      if (content !== undefined && content.length > 0) {
        throw new ValidationError('"hardBreak" is a leaf node and cannot have content.');
      }
      break;
    }

    case 'horizontalRule': {
      if (parentType !== 'doc' && parentType !== 'listItem' && parentType !== 'blockquote') {
        throw new ValidationError(
          `"horizontalRule" cannot be a direct child of "${parentType}".`
        );
      }
      if (content !== undefined && content.length > 0) {
        throw new ValidationError('"horizontalRule" is a leaf node and cannot have content.');
      }
      break;
    }

    case 'text': {
      if (
        parentType !== 'paragraph' &&
        parentType !== 'heading' &&
        parentType !== 'codeBlock'
      ) {
        throw new ValidationError(
          `"text" node cannot be a direct child of "${parentType}".`
        );
      }
      if (typeof text !== 'string') {
        throw new ValidationError('"text" property is required on text node.');
      }
      if (content !== undefined) {
        throw new ValidationError('Text node is a leaf and cannot have content.');
      }
      if (marks !== undefined) {
        if (!Array.isArray(marks)) {
          throw new ValidationError('"marks" on text node must be an array.');
        }
        const seenMarks = new Set();
        for (const mark of marks) {
          validateMark(mark, seenMarks);
        }
      }
      break;
    }

    default:
      throw new ValidationError(`Unsupported node type: "${type}".`);
  }
}

/**
 * Validates rich-text editor JSON document against the Stage 5A schema contract.
 *
 * @param {any} content
 * @returns {object} Validated content object
 */
export function validateContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new ValidationError('Note content must be a valid JSON object.');
  }

  // Bounded payload size check
  let serialized;
  try {
    serialized = JSON.stringify(content);
  } catch {
    throw new ValidationError('Content could not be serialized to JSON.');
  }

  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength > LIMITS.MAX_CONTENT_BYTES) {
    throw new ValidationError(
      `Content size (${byteLength} bytes) exceeds limit of ${LIMITS.MAX_CONTENT_BYTES} bytes.`,
      400,
      'CONTENT_TOO_LARGE'
    );
  }

  if (content.type !== 'doc') {
    throw new ValidationError('Top-level content node must be of type "doc".');
  }

  const counter = { count: 0 };
  validateNode(content, null, 1, counter);

  return content;
}

/**
 * Derives clean, searchable plain text from validated ProseMirror / Tiptap JSON.
 * Preserves boundaries between paragraphs, headings, list items, and code blocks.
 *
 * @param {object} node
 * @returns {string} Server-derived plain text
 */
export function derivePlainText(node) {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const chunks = [];

  function walk(n) {
    if (!n || typeof n !== 'object') return;

    if (n.type === 'text' && typeof n.text === 'string') {
      chunks.push(n.text);
      return;
    }

    if (n.type === 'hardBreak') {
      chunks.push('\n');
      return;
    }

    const isBlock = [
      'paragraph',
      'heading',
      'listItem',
      'blockquote',
      'codeBlock',
      'horizontalRule',
    ].includes(n.type);

    if (isBlock && chunks.length > 0 && !chunks[chunks.length - 1].endsWith('\n')) {
      chunks.push('\n');
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child);
      }
    }

    if (isBlock && chunks.length > 0 && !chunks[chunks.length - 1].endsWith('\n')) {
      chunks.push('\n');
    }
  }

  walk(node);

  return chunks
    .join('')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Generates a bounded plain-text preview for listing items.
 *
 * @param {string} text
 * @param {number} [maxLength=150]
 * @returns {string}
 */
export function generatePreview(text, maxLength = 150) {
  if (!text || typeof text !== 'string') return '';
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return singleLine.slice(0, maxLength).trimEnd() + '…';
}
