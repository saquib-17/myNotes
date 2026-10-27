/**
 * Notes API service.
 * Handles private notes listing, searching, reading, explicit saving,
 * and soft-deletion using the Stage 5A backend API.
 *
 * All state-changing requests (POST, PATCH) include the session-bound CSRF token
 * in the X-Csrf-Token header. Credentials (session cookies) are sent via credentials: 'include'.
 */

import { ApiError } from './auth.service.js';

const API_BASE = '/api/notes';
const COLLECTIONS_API_BASE = '/api/collections';
const TAGS_API_BASE = '/api/tags';
const TASKS_API_BASE = '/api/tasks';
const QUESTIONS_API_BASE = '/api/questions';
const DOCUMENTS_API_BASE = '/api/documents';

export const NOTE_LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_CONTENT_BYTES: 256 * 1024, // 256 KiB
};

export const TAG_LIMITS = {
  MAX_NAME_LENGTH: 40,
  MAX_TAGS_PER_NOTE: 20,
};

export const TASK_LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_DETAILS_LENGTH: 5000,
  ALLOWED_STATUSES: ['pending', 'completed'],
  ALLOWED_PRIORITIES: ['none', 'low', 'medium', 'high'],
};

export const QUESTION_LIMITS = {
  MAX_QUESTION_LENGTH: 2000,
  MAX_ANSWER_LENGTH: 5000,
  MAX_EXPLANATION_LENGTH: 5000,
  MAX_TOPIC_LENGTH: 80,
  MIN_MCQ_OPTIONS: 2,
  MAX_MCQ_OPTIONS: 6,
  MAX_MCQ_OPTION_LENGTH: 300,
  ALLOWED_TYPES: ['SHORT_ANSWER', 'MCQ', 'CODING'],
  ALLOWED_DIFFICULTIES: ['easy', 'medium', 'hard'],
  ALLOWED_STATUSES: ['unlearned', 'learning', 'mastered'],
};

export const DOCUMENT_LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_URL_LENGTH: 2048,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_TOPIC_LENGTH: 80,
  ALLOWED_CATEGORIES: ['pdf', 'article', 'documentation', 'course', 'video', 'repository', 'other'],
};

/**
 * Calculates the exact UTF-8 byte length of a string.
 *
 * @param {string} str
 * @returns {number}
 */
export function calculateUtf8Bytes(str) {
  if (typeof str !== 'string') return 0;
  return new TextEncoder().encode(str).length;
}

/**
 * Validates note title and rich-text content on the client before sending.
 * Throws a user-friendly Error if limits are exceeded.
 *
 * @param {string} title
 * @param {object} content
 */
export function validateClientNote(title, content) {
  if (typeof title === 'string' && title.trim().length > NOTE_LIMITS.MAX_TITLE_LENGTH) {
    throw new Error(`Title cannot exceed ${NOTE_LIMITS.MAX_TITLE_LENGTH} characters.`);
  }

  if (content !== undefined && content !== null) {
    let serialized;
    try {
      serialized = JSON.stringify(content);
    } catch {
      throw new Error('Content could not be serialized.');
    }
    const byteLength = calculateUtf8Bytes(serialized);
    if (byteLength > NOTE_LIMITS.MAX_CONTENT_BYTES) {
      throw new Error(
        `Note content size (${Math.round(byteLength / 1024)} KiB) exceeds maximum limit of 256 KiB.`
      );
    }
  }
}

/**
 * Validates a tag name on the client before submission.
 *
 * @param {string} name
 */
export function validateClientTagName(name) {
  if (typeof name !== 'string') {
    throw new Error('Tag name must be a string.');
  }
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    throw new Error('Tag name cannot be empty or blank.');
  }
  if (trimmed.length > TAG_LIMITS.MAX_NAME_LENGTH) {
    throw new Error(`Tag name cannot exceed ${TAG_LIMITS.MAX_NAME_LENGTH} characters.`);
  }
  return trimmed;
}

/**
 * Fetches paginated notes for the authenticated user, optionally filtered by search query.
 *
 * @param {object} params
 * @param {string} [params.q] - Literal search query
 * @param {number} [params.limit=20] - Page size
 * @param {number} [params.offset=0] - Offset
 * @param {AbortSignal} [params.signal] - Optional abort signal
 * @returns {Promise<{ notes: Array<object>, total: number, limit: number, offset: number, hasMore: boolean }>}
 */
export async function fetchNotes({ q = '', collectionId, tagId, tag, limit = 20, offset = 0, signal } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  if (q && q.trim()) params.set('q', q.trim());
  if (collectionId) params.set('collectionId', collectionId);
  if (tagId) params.set('tagId', tagId);
  if (tag) params.set('tag', tag);

  const response = await fetch(`${API_BASE}?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch notes (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  const rawList = (
    Array.isArray(data.notes)
      ? data.notes
      : Array.isArray(data.items)
        ? data.items
        : []
  ).map((note) => ({
    ...note,
    pinned: Boolean(note.pinned),
  }));
  const normalizedTotal =
    typeof data.total === 'number'
      ? data.total
      : (typeof data.offset === 'number' ? data.offset : offset) + rawList.length;

  return {
    ...data,
    notes: rawList,
    items: rawList,
    total: normalizedTotal,
    hasMore: Boolean(data.hasMore),
  };
}

/**
 * Fetches a single note by UUID.
 *
 * @param {string} id - Note UUID
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ id: string, title: string, content: object, version: number, createdAt: string, updatedAt: string }>}
 */
export async function fetchNoteById(id, { signal } = {}) {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch note (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Creates a new note.
 *
 * @param {object} params
 * @param {string} [params.title]
 * @param {object} [params.content]
 * @param {string} params.csrfToken
 * @returns {Promise<{ id: string, title: string, content: object, version: number, createdAt: string, updatedAt: string }>}
 */
export async function createNote({ title = '', content, collectionId, tags, csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required for note creation.');
  }

  validateClientNote(title, content);

  const payload = {
    title: typeof title === 'string' ? title.trim() : '',
  };
  if (content !== undefined) {
    payload.content = content;
  }
  if (collectionId !== undefined && collectionId !== null) {
    payload.collectionId = collectionId;
  }
  if (Array.isArray(tags)) {
    payload.tags = tags;
  }

  const response = await fetch(API_BASE, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to create note (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Updates an existing note using optimistic concurrency.
 *
 * @param {string} id - Note UUID
 * @param {object} params
 * @param {string} params.title
 * @param {object} params.content
 * @param {number} params.expectedVersion - Current known note version
 * @param {string} params.csrfToken
 * @returns {Promise<{ id: string, title: string, content: object, version: number, createdAt: string, updatedAt: string }>}
 */
export async function updateNote(id, { title, content, expectedVersion, pinned, collectionId, tags, csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required for note update.');
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error('Valid expectedVersion is required for note update.');
  }

  validateClientNote(title, content);

  const payload = {
    title: typeof title === 'string' ? title.trim() : '',
    content,
    expectedVersion,
  };
  if (typeof pinned === 'boolean') {
    payload.pinned = pinned;
  }
  if (collectionId !== undefined) {
    payload.collectionId = collectionId;
  }
  if (Array.isArray(tags)) {
    payload.tags = tags;
  }

  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to save note (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Moves a note to the trash.
 *
 * @param {string} id - Note UUID
 * @param {object} params
 * @param {number} params.expectedVersion
 * @param {string} params.csrfToken
 * @returns {Promise<void>}
 */
export async function trashNote(id, { expectedVersion, csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required to trash a note.');
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error('Valid expectedVersion is required to trash a note.');
  }

  const response = await fetch(`${API_BASE}/${id}/trash`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: JSON.stringify({ expectedVersion }),
  });

  if (response.status === 204) {
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    // Non-JSON error
  }

  throw new ApiError(
    data?.message || `Failed to trash note (HTTP ${response.status})`,
    response.status,
    data?.code || data?.error
  );
}

/**
 * Pins a note.
 *
 * @param {string} id - Note UUID
 * @param {object} params
 * @param {string} params.csrfToken
 * @returns {Promise<{ id: string, pinned: boolean, [key: string]: any }>}
 */
export async function pinNote(id, { csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required to pin a note.');
  }

  const response = await fetch(`${API_BASE}/${id}/pin`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to pin note (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return {
    ...data,
    pinned: Boolean(data.pinned),
  };
}

/**
 * Unpins a note.
 *
 * @param {string} id - Note UUID
 * @param {object} params
 * @param {string} params.csrfToken
 * @returns {Promise<{ id: string, pinned: boolean, [key: string]: any }>}
 */
export async function unpinNote(id, { csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required to unpin a note.');
  }

  const response = await fetch(`${API_BASE}/${id}/unpin`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to unpin note (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return {
    ...data,
    pinned: Boolean(data.pinned),
  };
}

/**
 * Fetches paginated soft-deleted (trashed) notes for the authenticated user.
 *
 * @param {object} params
 * @param {number} [params.limit=20] - Page size
 * @param {number} [params.offset=0] - Offset
 * @param {AbortSignal} [params.signal] - Optional abort signal
 * @returns {Promise<{ notes: Array<object>, total: number, limit: number, offset: number, hasMore: boolean }>}
 */
export async function fetchTrashedNotes({ limit = 20, offset = 0, signal } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));

  const response = await fetch(`${API_BASE}/trash?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch trashed notes (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  const rawList = (
    Array.isArray(data.notes)
      ? data.notes
      : Array.isArray(data.items)
        ? data.items
        : []
  ).map((note) => ({
    ...note,
    pinned: Boolean(note.pinned),
  }));

  const normalizedTotal =
    typeof data.total === 'number'
      ? data.total
      : (typeof data.offset === 'number' ? data.offset : offset) + rawList.length;

  return {
    ...data,
    notes: rawList,
    items: rawList,
    total: normalizedTotal,
    hasMore: Boolean(data.hasMore),
  };
}

/**
 * Restores a soft-deleted note from the trash.
 *
 * @param {string} id - Note UUID
 * @param {object} params
 * @param {string} params.csrfToken
 * @returns {Promise<{ id: string, title: string, pinned: boolean, version: number, [key: string]: any }>}
 */
export async function restoreNote(id, { csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required to restore a note.');
  }

  const response = await fetch(`${API_BASE}/${id}/restore`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to restore note (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return {
    ...data,
    pinned: Boolean(data.pinned),
  };
}

export const COLLECTION_LIMITS = {
  MAX_NAME_LENGTH: 80,
};

export function validateClientCollectionName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Collection name cannot be empty.');
  }
  if (name.trim().length > COLLECTION_LIMITS.MAX_NAME_LENGTH) {
    throw new Error(`Collection name cannot exceed ${COLLECTION_LIMITS.MAX_NAME_LENGTH} characters.`);
  }
}

/**
 * Fetches all active collections for the current user.
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ collections: Array<object>, items: Array<object>, total: number }>}
 */
export async function fetchCollections({ signal } = {}) {
  const response = await fetch(COLLECTIONS_API_BASE, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch collections (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  const items = Array.isArray(data.collections)
    ? data.collections
    : Array.isArray(data.items)
      ? data.items
      : [];

  return {
    ...data,
    collections: items,
    items,
    total: typeof data.total === 'number' ? data.total : items.length,
  };
}

/**
 * Creates a new named collection.
 *
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.csrfToken
 * @returns {Promise<{ id: string, name: string, createdAt: string, updatedAt: string, noteCount: number }>}
 */
export async function createCollection({ name, csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required for collection creation.');
  }

  validateClientCollectionName(name);

  const response = await fetch(COLLECTIONS_API_BASE, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: JSON.stringify({ name: name.trim() }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to create collection (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Renames an existing collection.
 *
 * @param {string} id
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.csrfToken
 * @returns {Promise<{ id: string, name: string, createdAt: string, updatedAt: string, noteCount: number }>}
 */
export async function updateCollection(id, { name, csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required for collection update.');
  }

  validateClientCollectionName(name);

  const response = await fetch(`${COLLECTIONS_API_BASE}/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: JSON.stringify({ name: name.trim() }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to update collection (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Soft-deletes a collection, clearing collection_id from associated notes.
 *
 * @param {string} id
 * @param {object} params
 * @param {string} params.csrfToken
 * @returns {Promise<void>}
 */
export async function deleteCollection(id, { csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required for collection deletion.');
  }

  const response = await fetch(`${COLLECTIONS_API_BASE}/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
  });

  if (response.status === 204) {
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    // Non-JSON error
  }

  throw new ApiError(
    data?.message || `Failed to delete collection (HTTP ${response.status})`,
    response.status,
    data?.code || data?.error
  );
}

/**
 * Fetches notes belonging to a specific collection.
 *
 * @param {string} id
 * @param {object} params
 * @param {string} [params.q]
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ notes: Array<object>, items: Array<object>, total: number, hasMore: boolean, collection: object }>}
 */
export async function fetchCollectionNotes(id, { q = '', limit = 20, offset = 0, signal } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  if (q && q.trim()) params.set('q', q.trim());

  const response = await fetch(`${COLLECTIONS_API_BASE}/${id}/notes?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch collection notes (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  const rawList = (
    Array.isArray(data.notes)
      ? data.notes
      : Array.isArray(data.items)
        ? data.items
        : []
  ).map((note) => ({
    ...note,
    pinned: Boolean(note.pinned),
  }));

  const normalizedTotal =
    typeof data.total === 'number'
      ? data.total
      : (typeof data.offset === 'number' ? data.offset : offset) + rawList.length;

  return {
    ...data,
    notes: rawList,
    items: rawList,
    total: normalizedTotal,
    hasMore: Boolean(data.hasMore),
    collection: data.collection,
  };
}

/**
 * Fetches all active tags owned by the authenticated user with note counts.
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array<{ id: string, name: string, noteCount: number, createdAt: string, updatedAt: string }>>}
 */
export async function fetchTags({ signal } = {}) {
  const response = await fetch(TAGS_API_BASE, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch tags (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return Array.isArray(data.tags) ? data.tags : Array.isArray(data.items) ? data.items : [];
}

/**
 * Creates a new tag.
 *
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.csrfToken
 * @returns {Promise<{ id: string, name: string, createdAt: string, updatedAt: string }>}
 */
export async function createTag({ name, csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required for tag creation.');
  }

  const normalized = validateClientTagName(name);

  const response = await fetch(TAGS_API_BASE, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: JSON.stringify({ name: normalized }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to create tag (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Renames an existing tag.
 *
 * @param {string} id - Tag UUID
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.csrfToken
 * @returns {Promise<{ id: string, name: string, createdAt: string, updatedAt: string }>}
 */
export async function updateTag(id, { name, csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required for tag update.');
  }

  const normalized = validateClientTagName(name);

  const response = await fetch(`${TAGS_API_BASE}/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: JSON.stringify({ name: normalized }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to update tag (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Deletes a tag (soft delete, unlinking all note associations while keeping notes intact).
 *
 * @param {string} id - Tag UUID
 * @param {object} params
 * @param {string} params.csrfToken
 * @returns {Promise<void>}
 */
export async function deleteTag(id, { csrfToken }) {
  if (!csrfToken) {
    throw new Error('CSRF token is required to delete a tag.');
  }

  const response = await fetch(`${TAGS_API_BASE}/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
  });

  if (response.status === 204) {
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    // Non-JSON response
  }

  throw new ApiError(
    data?.message || `Failed to delete tag (HTTP ${response.status})`,
    response.status,
    data?.code || data?.error
  );
}

/**
 * Fetches notes belonging to a specific tag.
 *
 * @param {string} id
 * @param {object} params
 * @param {string} [params.q]
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ notes: Array<object>, items: Array<object>, total: number, hasMore: boolean, tag: object }>}
 */
export async function fetchTagNotes(id, { q = '', limit = 20, offset = 0, signal } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  if (q && q.trim()) params.set('q', q.trim());

  const response = await fetch(`${TAGS_API_BASE}/${id}/notes?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch tag notes (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  const rawList = (
    Array.isArray(data.notes)
      ? data.notes
      : Array.isArray(data.items)
        ? data.items
        : []
  ).map((note) => ({
    ...note,
    pinned: Boolean(note.pinned),
  }));

  const normalizedTotal =
    typeof data.total === 'number'
      ? data.total
      : (typeof data.offset === 'number' ? data.offset : offset) + rawList.length;

  return {
    ...data,
    notes: rawList,
    items: rawList,
    total: normalizedTotal,
    hasMore: Boolean(data.hasMore),
    tag: data.tag,
  };
}

/**
 * Validates task fields on the client before network transmission.
 */
export function validateClientTask({ title, details, dueDate, priority, status } = {}) {
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Task title cannot be empty.');
    }
    if (title.trim().length > TASK_LIMITS.MAX_TITLE_LENGTH) {
      throw new Error(`Task title cannot exceed ${TASK_LIMITS.MAX_TITLE_LENGTH} characters.`);
    }
  }

  if (details !== undefined && details !== null && details.trim().length > 0) {
    if (details.trim().length > TASK_LIMITS.MAX_DETAILS_LENGTH) {
      throw new Error(`Task details cannot exceed ${TASK_LIMITS.MAX_DETAILS_LENGTH} characters.`);
    }
  }

  if (dueDate !== undefined && dueDate !== null && dueDate.trim().length > 0) {
    const trimmed = dueDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new Error('Task due date must be in YYYY-MM-DD format.');
    }
    const [yearStr, monthStr, dayStr] = trimmed.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new Error('Task due date must be a valid calendar date.');
    }
  }

  if (priority !== undefined && priority !== null) {
    if (!TASK_LIMITS.ALLOWED_PRIORITIES.includes(priority.toLowerCase())) {
      throw new Error(`Priority must be one of: ${TASK_LIMITS.ALLOWED_PRIORITIES.join(', ')}.`);
    }
  }

  if (status !== undefined && status !== null) {
    if (!TASK_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())) {
      throw new Error(`Status must be one of: ${TASK_LIMITS.ALLOWED_STATUSES.join(', ')}.`);
    }
  }
}

/**
 * Fetches tasks owned by the authenticated user.
 */
export async function fetchTasks({
  status,
  priority,
  q = '',
  limit = 20,
  offset = 0,
  signal,
} = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (q && q.trim()) params.set('q', q.trim());
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const response = await fetch(`${TASKS_API_BASE}?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch tasks (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  const rawList = Array.isArray(data.tasks)
    ? data.tasks
    : Array.isArray(data.items)
      ? data.items
      : [];

  const normalizedTotal =
    typeof data.total === 'number'
      ? data.total
      : (typeof data.offset === 'number' ? data.offset : offset) + rawList.length;

  return {
    tasks: rawList,
    items: rawList,
    total: normalizedTotal,
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
    hasMore: Boolean(data.hasMore),
  };
}

/**
 * Fetches a single task by ID.
 */
export async function fetchTaskById(id, { signal } = {}) {
  const response = await fetch(`${TASKS_API_BASE}/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch task (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Creates a new task.
 */
export async function createTask({
  title,
  details = null,
  status = 'pending',
  priority = 'none',
  dueDate = null,
  csrfToken,
} = {}) {
  validateClientTask({ title, details, dueDate, priority, status });

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const payload = {
    title: title.trim(),
    details: details && details.trim().length > 0 ? details.trim() : null,
    status,
    priority,
    dueDate: dueDate && dueDate.trim().length > 0 ? dueDate.trim() : null,
  };

  const response = await fetch(TASKS_API_BASE, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to create task (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Updates an existing task.
 */
export async function updateTask(
  id,
  {
    title,
    details,
    status,
    priority,
    dueDate,
    csrfToken,
  } = {}
) {
  validateClientTask({ title, details, dueDate, priority, status });

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const payload = {};
  if (title !== undefined) payload.title = title.trim();
  if (details !== undefined) {
    payload.details = details && details.trim().length > 0 ? details.trim() : null;
  }
  if (status !== undefined) payload.status = status;
  if (priority !== undefined) payload.priority = priority;
  if (dueDate !== undefined) {
    payload.dueDate = dueDate && dueDate.trim().length > 0 ? dueDate.trim() : null;
  }

  const response = await fetch(`${TASKS_API_BASE}/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to update task (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Convenience method to mark a task as completed.
 */
export async function completeTask(id, { csrfToken } = {}) {
  const headers = {
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const response = await fetch(`${TASKS_API_BASE}/${id}/complete`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to complete task (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Convenience method to reopen a task back to pending.
 */
export async function reopenTask(id, { csrfToken } = {}) {
  const headers = {
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const response = await fetch(`${TASKS_API_BASE}/${id}/reopen`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to reopen task (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Soft deletes a task.
 */
export async function deleteTask(id, { csrfToken } = {}) {
  const headers = {};

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const response = await fetch(`${TASKS_API_BASE}/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    throw new ApiError(
      data?.message || `Failed to delete task (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return true;
}

/**
 * Validates question fields on the client before network transmission.
 */
export function validateClientQuestion({
  type,
  question,
  answer,
  explanation,
  topic,
  difficulty,
  status,
  options,
  correctOptionIndex,
} = {}) {
  if (type !== undefined) {
    if (typeof type !== 'string' || !QUESTION_LIMITS.ALLOWED_TYPES.includes(type.toUpperCase())) {
      throw new Error(`Question type must be one of: ${QUESTION_LIMITS.ALLOWED_TYPES.join(', ')}.`);
    }
  }

  if (question !== undefined) {
    if (typeof question !== 'string' || question.trim().length === 0) {
      throw new Error('Question text cannot be empty.');
    }
    if (question.trim().length > QUESTION_LIMITS.MAX_QUESTION_LENGTH) {
      throw new Error(
        `Question text cannot exceed ${QUESTION_LIMITS.MAX_QUESTION_LENGTH} characters.`
      );
    }
  }

  if (answer !== undefined && answer !== null && answer.trim().length > 0) {
    if (answer.trim().length > QUESTION_LIMITS.MAX_ANSWER_LENGTH) {
      throw new Error(
        `Answer cannot exceed ${QUESTION_LIMITS.MAX_ANSWER_LENGTH} characters.`
      );
    }
  }

  if (explanation !== undefined && explanation !== null && explanation.trim().length > 0) {
    if (explanation.trim().length > QUESTION_LIMITS.MAX_EXPLANATION_LENGTH) {
      throw new Error(
        `Explanation cannot exceed ${QUESTION_LIMITS.MAX_EXPLANATION_LENGTH} characters.`
      );
    }
  }

  if (topic !== undefined && topic !== null && topic.trim().length > 0) {
    if (topic.trim().length > QUESTION_LIMITS.MAX_TOPIC_LENGTH) {
      throw new Error(`Topic cannot exceed ${QUESTION_LIMITS.MAX_TOPIC_LENGTH} characters.`);
    }
  }

  if (difficulty !== undefined && difficulty !== null) {
    if (!QUESTION_LIMITS.ALLOWED_DIFFICULTIES.includes(difficulty.toLowerCase())) {
      throw new Error(
        `Difficulty must be one of: ${QUESTION_LIMITS.ALLOWED_DIFFICULTIES.join(', ')}.`
      );
    }
  }

  if (status !== undefined && status !== null) {
    if (!QUESTION_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())) {
      throw new Error(`Status must be one of: ${QUESTION_LIMITS.ALLOWED_STATUSES.join(', ')}.`);
    }
  }

  if (type && type.toUpperCase() === 'MCQ') {
    if (!Array.isArray(options) || options.length < QUESTION_LIMITS.MIN_MCQ_OPTIONS || options.length > QUESTION_LIMITS.MAX_MCQ_OPTIONS) {
      throw new Error(
        `MCQ questions must have between ${QUESTION_LIMITS.MIN_MCQ_OPTIONS} and ${QUESTION_LIMITS.MAX_MCQ_OPTIONS} options.`
      );
    }
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (typeof opt !== 'string' || opt.trim().length === 0) {
        throw new Error(`MCQ option ${i + 1} cannot be empty.`);
      }
      if (opt.trim().length > QUESTION_LIMITS.MAX_MCQ_OPTION_LENGTH) {
        throw new Error(
          `MCQ option ${i + 1} cannot exceed ${QUESTION_LIMITS.MAX_MCQ_OPTION_LENGTH} characters.`
        );
      }
    }
    if (
      correctOptionIndex === undefined ||
      correctOptionIndex === null ||
      typeof correctOptionIndex !== 'number' ||
      correctOptionIndex < 0 ||
      correctOptionIndex >= options.length
    ) {
      throw new Error(`Please select a valid correct option (1 to ${options.length}).`);
    }
  }
}

/**
 * Fetches questions with optional filters, search, and pagination.
 */
export async function fetchQuestions({
  type,
  difficulty,
  status,
  topic,
  q = '',
  limit = 20,
  offset = 0,
  signal,
} = {}) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (difficulty) params.set('difficulty', difficulty);
  if (status) params.set('status', status);
  if (topic && topic.trim()) params.set('topic', topic.trim());
  if (q && q.trim()) params.set('q', q.trim());
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const response = await fetch(`${QUESTIONS_API_BASE}?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch questions (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  const rawList = Array.isArray(data.questions)
    ? data.questions
    : Array.isArray(data.items)
    ? data.items
    : [];

  const normalizedTotal =
    typeof data.total === 'number'
      ? data.total
      : (typeof data.offset === 'number' ? data.offset : offset) + rawList.length;

  return {
    questions: rawList,
    items: rawList,
    total: normalizedTotal,
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
    hasMore: Boolean(data.hasMore),
  };
}

/**
 * Fetches a single question by ID.
 */
export async function fetchQuestionById(id, { signal } = {}) {
  const response = await fetch(`${QUESTIONS_API_BASE}/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch question (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Creates a new question.
 */
export async function createQuestion({
  type,
  question,
  answer = null,
  explanation = null,
  topic = null,
  difficulty = 'medium',
  status = 'unlearned',
  options = null,
  correctOptionIndex = null,
  csrfToken,
} = {}) {
  validateClientQuestion({
    type,
    question,
    answer,
    explanation,
    topic,
    difficulty,
    status,
    options,
    correctOptionIndex,
  });

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const payload = {
    type: type.toUpperCase().trim(),
    question: question.trim(),
    answer: answer && answer.trim().length > 0 ? answer.trim() : null,
    explanation: explanation && explanation.trim().length > 0 ? explanation.trim() : null,
    topic: topic && topic.trim().length > 0 ? topic.trim() : null,
    difficulty,
    status,
  };

  if (payload.type === 'MCQ') {
    payload.options = options.map((opt) => opt.trim());
    payload.correctOptionIndex = correctOptionIndex;
  }

  const response = await fetch(QUESTIONS_API_BASE, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to create question (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Updates an existing question.
 */
export async function updateQuestion(
  id,
  {
    type,
    question,
    answer,
    explanation,
    topic,
    difficulty,
    status,
    options,
    correctOptionIndex,
    csrfToken,
  } = {}
) {
  validateClientQuestion({
    type,
    question,
    answer,
    explanation,
    topic,
    difficulty,
    status,
    options,
    correctOptionIndex,
  });

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const payload = {};
  if (type !== undefined) payload.type = type.toUpperCase().trim();
  if (question !== undefined) payload.question = question.trim();
  if (answer !== undefined) {
    payload.answer = answer && answer.trim().length > 0 ? answer.trim() : null;
  }
  if (explanation !== undefined) {
    payload.explanation =
      explanation && explanation.trim().length > 0 ? explanation.trim() : null;
  }
  if (topic !== undefined) {
    payload.topic = topic && topic.trim().length > 0 ? topic.trim() : null;
  }
  if (difficulty !== undefined) payload.difficulty = difficulty;
  if (status !== undefined) payload.status = status;
  if (options !== undefined) {
    payload.options = Array.isArray(options) ? options.map((opt) => opt.trim()) : null;
  }
  if (correctOptionIndex !== undefined) {
    payload.correctOptionIndex = correctOptionIndex;
  }

  const response = await fetch(`${QUESTIONS_API_BASE}/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to update question (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Records a practice attempt for a question.
 */
export async function practiceQuestion(id, { result = null, csrfToken } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const payload = {};
  if (result) payload.result = result;

  const response = await fetch(`${QUESTIONS_API_BASE}/${id}/practice`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to record practice (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Updates the mastery status of a question.
 */
export async function updateQuestionStatus(id, { status, csrfToken } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const response = await fetch(`${QUESTIONS_API_BASE}/${id}/status`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify({ status }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to update question status (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Soft deletes a question.
 */
export async function deleteQuestion(id, { csrfToken } = {}) {
  const headers = {};

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const response = await fetch(`${QUESTIONS_API_BASE}/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    throw new ApiError(
      data?.message || `Failed to delete question (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return true;
}

/**
 * Validates a document on the client before submission.
 */
export function validateClientDocument({ title, url, description, topic, category }) {
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Document title cannot be empty.');
    }
    if (title.trim().length > DOCUMENT_LIMITS.MAX_TITLE_LENGTH) {
      throw new Error(`Document title cannot exceed ${DOCUMENT_LIMITS.MAX_TITLE_LENGTH} characters.`);
    }
  }

  if (url !== undefined) {
    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('Document URL cannot be empty.');
    }
    if (url.trim().length > DOCUMENT_LIMITS.MAX_URL_LENGTH) {
      throw new Error(`Document URL cannot exceed ${DOCUMENT_LIMITS.MAX_URL_LENGTH} characters.`);
    }
    let parsed;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new Error('Document URL must be a valid, well-formed URL.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Document URL must use http or https protocol.');
    }
  }

  if (description !== undefined && description !== null && description.trim().length > 0) {
    if (description.trim().length > DOCUMENT_LIMITS.MAX_DESCRIPTION_LENGTH) {
      throw new Error(`Description cannot exceed ${DOCUMENT_LIMITS.MAX_DESCRIPTION_LENGTH} characters.`);
    }
  }

  if (topic !== undefined && topic !== null && topic.trim().length > 0) {
    if (topic.trim().length > DOCUMENT_LIMITS.MAX_TOPIC_LENGTH) {
      throw new Error(`Topic cannot exceed ${DOCUMENT_LIMITS.MAX_TOPIC_LENGTH} characters.`);
    }
  }

  if (category !== undefined && category !== null) {
    if (!DOCUMENT_LIMITS.ALLOWED_CATEGORIES.includes(category.toLowerCase().trim())) {
      throw new Error(`Category must be one of: ${DOCUMENT_LIMITS.ALLOWED_CATEGORIES.join(', ')}.`);
    }
  }
}

/**
 * Fetches documents with optional filters, search, and pagination.
 */
export async function fetchDocuments({
  category,
  topic,
  favorite,
  q = '',
  limit = 20,
  offset = 0,
  signal,
} = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (topic && topic.trim()) params.set('topic', topic.trim());
  if (favorite !== undefined && favorite !== null) params.set('favorite', String(favorite));
  if (q && q.trim()) params.set('q', q.trim());
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const response = await fetch(`${DOCUMENTS_API_BASE}?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch documents (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  const rawList = Array.isArray(data.documents)
    ? data.documents
    : Array.isArray(data.items)
    ? data.items
    : [];

  const normalizedTotal =
    typeof data.total === 'number'
      ? data.total
      : (typeof data.offset === 'number' ? data.offset : offset) + rawList.length;

  return {
    documents: rawList,
    items: rawList,
    total: normalizedTotal,
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
    hasMore: Boolean(data.hasMore),
  };
}

/**
 * Fetches a single document by ID.
 */
export async function fetchDocumentById(id, { signal } = {}) {
  const response = await fetch(`${DOCUMENTS_API_BASE}/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to fetch document (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Creates a new document.
 */
export async function createDocument({
  title,
  url,
  description = null,
  category = 'other',
  topic = null,
  favorite = false,
  csrfToken,
}) {
  validateClientDocument({
    title,
    url,
    description,
    category,
    topic,
  });

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const payload = {
    title: title.trim(),
    url: url.trim(),
    description: description && description.trim().length > 0 ? description.trim() : null,
    category: category ? category.toLowerCase().trim() : 'other',
    topic: topic && topic.trim().length > 0 ? topic.trim() : null,
    favorite: Boolean(favorite),
  };

  const response = await fetch(DOCUMENTS_API_BASE, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to create document (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Updates an existing document.
 */
export async function updateDocument(
  id,
  {
    title,
    url,
    description,
    category,
    topic,
    favorite,
    csrfToken,
  } = {}
) {
  validateClientDocument({
    title,
    url,
    description,
    category,
    topic,
  });

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const payload = {};
  if (title !== undefined) payload.title = title.trim();
  if (url !== undefined) payload.url = url.trim();
  if (description !== undefined) {
    payload.description = description && description.trim().length > 0 ? description.trim() : null;
  }
  if (category !== undefined) payload.category = category.toLowerCase().trim();
  if (topic !== undefined) {
    payload.topic = topic && topic.trim().length > 0 ? topic.trim() : null;
  }
  if (favorite !== undefined) payload.favorite = Boolean(favorite);

  const response = await fetch(`${DOCUMENTS_API_BASE}/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to update document (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Marks a document as favorite.
 */
export async function favoriteDocument(id, { csrfToken } = {}) {
  const headers = {
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const response = await fetch(`${DOCUMENTS_API_BASE}/${id}/favorite`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to favorite document (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Unmarks a document as favorite.
 */
export async function unfavoriteDocument(id, { csrfToken } = {}) {
  const headers = {
    Accept: 'application/json',
  };

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const response = await fetch(`${DOCUMENTS_API_BASE}/${id}/unfavorite`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Failed to unfavorite document (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return data;
}

/**
 * Soft deletes a document.
 */
export async function deleteDocument(id, { csrfToken } = {}) {
  const headers = {};

  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const response = await fetch(`${DOCUMENTS_API_BASE}/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    throw new ApiError(
      data?.message || `Failed to delete document (HTTP ${response.status})`,
      response.status,
      data?.code || data?.error
    );
  }

  return true;
}





