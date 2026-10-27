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

export const NOTE_LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_CONTENT_BYTES: 256 * 1024, // 256 KiB
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
 * Fetches paginated notes for the authenticated user, optionally filtered by search query.
 *
 * @param {object} params
 * @param {string} [params.q] - Literal search query
 * @param {number} [params.limit=20] - Page size
 * @param {number} [params.offset=0] - Offset
 * @param {AbortSignal} [params.signal] - Optional abort signal
 * @returns {Promise<{ notes: Array<object>, total: number, limit: number, offset: number, hasMore: boolean }>}
 */
export async function fetchNotes({ q = '', collectionId, limit = 20, offset = 0, signal } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  if (q && q.trim()) params.set('q', q.trim());
  if (collectionId) params.set('collectionId', collectionId);

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
export async function createNote({ title = '', content, collectionId, csrfToken }) {
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
export async function updateNote(id, { title, content, expectedVersion, pinned, collectionId, csrfToken }) {
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

const COLLECTIONS_API_BASE = '/api/collections';

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



