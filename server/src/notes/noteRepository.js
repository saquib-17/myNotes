import { getPool } from '../db/pool.js';

/**
 * Escapes characters with special meaning in SQL LIKE patterns (%, _, \).
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeLikeWildcards(str) {
  return str.replace(/[\\%_]/g, '\\$&');
}

/**
 * Creates a new note in the database.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.title
 * @param {object} params.contentJson
 * @param {string} params.contentText
 * @param {boolean} [params.pinned=false]
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<object>} Created note record
 */
export async function createNote({
  userId,
  title,
  contentJson,
  contentText,
  pinned = false,
  collectionId = null,
  pool = getPool(),
}) {
  const query = `
    INSERT INTO notes (user_id, title, content_json, content_text, pinned, collection_id, version)
    VALUES ($1, $2, $3, $4, COALESCE($5, false), $6, 1)
    RETURNING id, title, content_json AS content, pinned, collection_id AS "collectionId", version, created_at AS "createdAt", updated_at AS "updatedAt";
  `;

  const values = [userId, title, JSON.stringify(contentJson), contentText, Boolean(pinned), collectionId || null];
  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Lists active notes for an authenticated user with optional search, collection filtering, and pagination.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.q] - Search query
 * @param {string} [params.collectionId] - Optional collection filter UUID
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ rawItems: object[], total: number, limit: number, offset: number, hasMore: boolean }>}
 */
export async function findNotesByUserId({
  userId,
  q = '',
  collectionId,
  limit = 20,
  offset = 0,
  pool = getPool(),
}) {
  const conditions = ['user_id = $1', 'deleted_at IS NULL'];
  const values = [userId];

  if (typeof collectionId === 'string' && collectionId.trim().length > 0) {
    values.push(collectionId.trim());
    conditions.push(`collection_id = $${values.length}`);
  }

  const trimmedQuery = typeof q === 'string' ? q.trim() : '';
  if (trimmedQuery.length > 0) {
    const escaped = escapeLikeWildcards(trimmedQuery);
    values.push(`%${escaped}%`);
    const paramIdx = values.length;
    conditions.push(
      `(title ILIKE $${paramIdx} ESCAPE '\\' OR content_text ILIKE $${paramIdx} ESCAPE '\\')`
    );
  }

  // Count total matching notes for accurate pagination
  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM notes
    WHERE ${conditions.join(' AND ')};
  `;
  const countResult = await pool.query(countQuery, values);
  const total = countResult.rows[0]?.total ?? 0;

  // Request limit + 1 rows to detect hasMore
  const selectValues = [...values, limit + 1, offset];
  const limitParamIdx = selectValues.length - 1;
  const offsetParamIdx = selectValues.length;

  const query = `
    SELECT id, title, content_text, pinned, collection_id AS "collectionId", version, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM notes
    WHERE ${conditions.join(' AND ')}
    ORDER BY pinned DESC, updated_at DESC, id ASC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const result = await pool.query(query, selectValues);
  const hasMore = result.rows.length > limit;
  const rawItems = hasMore ? result.rows.slice(0, limit) : result.rows;

  return {
    rawItems,
    total,
    limit,
    offset,
    hasMore,
  };
}

/**
 * Finds a single active note by ID scoped to the authenticated owner.
 *
 * @param {object} params
 * @param {string} params.id - Note UUID
 * @param {string} params.userId - Owner UUID
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<object|null>}
 */
export async function findNoteByIdAndUserId({
  id,
  userId,
  pool = getPool(),
}) {
  const query = `
    SELECT id, title, content_json AS content, pinned, collection_id AS "collectionId", version, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM notes
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;
  `;

  const result = await pool.query(query, [id, userId]);
  return result.rows[0] || null;
}

/**
 * Conditionally updates an active note using optimistic concurrency.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {number} params.expectedVersion
 * @param {string} params.title
 * @param {object} params.contentJson
 * @param {string} params.contentText
 * @param {boolean} [params.pinned]
 * @param {string|null} [params.collectionId] - Optional collection UUID or null to unassign
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ updatedNote?: object, notFound?: boolean, conflict?: boolean }>}
 */
export async function updateNote({
  id,
  userId,
  expectedVersion,
  title,
  contentJson,
  contentText,
  pinned,
  collectionId,
  pool = getPool(),
}) {
  const isCollectionProvided = collectionId !== undefined;
  const updateQuery = `
    UPDATE notes
    SET title = $1,
        content_json = $2,
        content_text = $3,
        pinned = COALESCE($4, pinned),
        collection_id = CASE WHEN $5::boolean THEN $6::uuid ELSE collection_id END,
        version = version + 1,
        updated_at = now()
    WHERE id = $7
      AND user_id = $8
      AND deleted_at IS NULL
      AND version = $9
    RETURNING id, title, content_json AS content, pinned, collection_id AS "collectionId", version, created_at AS "createdAt", updated_at AS "updatedAt";
  `;

  const values = [
    title,
    JSON.stringify(contentJson),
    contentText,
    typeof pinned === 'boolean' ? pinned : null,
    isCollectionProvided,
    collectionId || null,
    id,
    userId,
    expectedVersion,
  ];

  const result = await pool.query(updateQuery, values);
  if (result.rowCount === 1) {
    return { updatedNote: result.rows[0] };
  }

  // Row not updated: disambiguate notFound vs conflict without exposing other user data
  const checkQuery = `
    SELECT user_id, version, deleted_at
    FROM notes
    WHERE id = $1;
  `;

  const checkResult = await pool.query(checkQuery, [id]);
  const row = checkResult.rows[0];

  if (!row || row.user_id !== userId || row.deleted_at !== null) {
    return { notFound: true };
  }

  return { conflict: true, currentVersion: row.version };
}

/**
 * Soft-deletes a note to trash using optimistic concurrency.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {number} params.expectedVersion
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ success?: boolean, notFound?: boolean, conflict?: boolean }>}
 */
export async function trashNote({
  id,
  userId,
  expectedVersion,
  pool = getPool(),
}) {
  const trashQuery = `
    UPDATE notes
    SET deleted_at = now(),
        updated_at = now(),
        version = version + 1
    WHERE id = $1
      AND user_id = $2
      AND deleted_at IS NULL
      AND version = $3
    RETURNING id;
  `;

  const result = await pool.query(trashQuery, [id, userId, expectedVersion]);
  if (result.rowCount === 1) {
    return { success: true };
  }

  // Disambiguate notFound vs conflict
  const checkQuery = `
    SELECT user_id, version, deleted_at
    FROM notes
    WHERE id = $1;
  `;

  const checkResult = await pool.query(checkQuery, [id]);
  const row = checkResult.rows[0];

  if (!row || row.user_id !== userId || row.deleted_at !== null) {
    return { notFound: true };
  }

  return { conflict: true, currentVersion: row.version };
}

/**
 * Toggles or sets a note's pinned state.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {boolean} params.pinned
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ updatedNote?: object, notFound?: boolean }>}
 */
export async function setNotePinned({
  id,
  userId,
  pinned,
  pool = getPool(),
}) {
  const query = `
    UPDATE notes
    SET pinned = $1,
        updated_at = now()
    WHERE id = $2
      AND user_id = $3
      AND deleted_at IS NULL
    RETURNING id, title, content_json AS content, pinned, collection_id AS "collectionId", version, created_at AS "createdAt", updated_at AS "updatedAt";
  `;

  const result = await pool.query(query, [Boolean(pinned), id, userId]);
  if (result.rowCount === 1) {
    return { updatedNote: result.rows[0] };
  }

  return { notFound: true };
}

/**
 * Lists soft-deleted (trashed) notes for an authenticated user with pagination.
 * Excludes active notes (deleted_at IS NOT NULL).
 * Ordered by deleted_at DESC, updated_at DESC, id ASC.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ rawItems: object[], total: number, limit: number, offset: number, hasMore: boolean }>}
 */
export async function findTrashedNotesByUserId({
  userId,
  limit = 20,
  offset = 0,
  pool = getPool(),
}) {
  const conditions = ['user_id = $1', 'deleted_at IS NOT NULL'];
  const values = [userId];

  // Count total trashed notes for accurate pagination
  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM notes
    WHERE ${conditions.join(' AND ')};
  `;
  const countResult = await pool.query(countQuery, values);
  const total = countResult.rows[0]?.total ?? 0;

  // Request limit + 1 rows to detect hasMore
  const selectValues = [...values, limit + 1, offset];
  const limitParamIdx = selectValues.length - 1;
  const offsetParamIdx = selectValues.length;

  const query = `
    SELECT id, title, content_text, pinned, collection_id AS "collectionId", version, created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"
    FROM notes
    WHERE ${conditions.join(' AND ')}
    ORDER BY deleted_at DESC, updated_at DESC, id ASC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const result = await pool.query(query, selectValues);
  const hasMore = result.rows.length > limit;
  const rawItems = hasMore ? result.rows.slice(0, limit) : result.rows;

  return {
    rawItems,
    total,
    limit,
    offset,
    hasMore,
  };
}

/**
 * Restores a soft-deleted note by setting deleted_at = NULL.
 * Only succeeds if the note is currently soft-deleted (deleted_at IS NOT NULL)
 * and owned by the specified user.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ restoredNote?: object, notFound?: boolean }>}
 */
export async function restoreNote({
  id,
  userId,
  pool = getPool(),
}) {
  const query = `
    UPDATE notes
    SET deleted_at = NULL,
        updated_at = now()
    WHERE id = $1
      AND user_id = $2
      AND deleted_at IS NOT NULL
    RETURNING id, title, content_json AS content, pinned, collection_id AS "collectionId", version, created_at AS "createdAt", updated_at AS "updatedAt";
  `;

  const result = await pool.query(query, [id, userId]);
  if (result.rowCount === 1) {
    return { restoredNote: result.rows[0] };
  }

  // Not found, owned by someone else, or already active
  return { notFound: true };
}
