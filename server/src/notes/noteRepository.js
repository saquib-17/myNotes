import { getPool } from '../db/pool.js';
import {
  syncNoteTags,
  findTagsByNoteId,
  findTagsByNoteIds,
} from '../tags/tagRepository.js';

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
 * @param {string} [params.workspaceId=null]
 * @param {string} params.title
 * @param {object} params.contentJson
 * @param {string} params.contentText
 * @param {boolean} [params.pinned=false]
 * @param {string|null} [params.collectionId=null]
 * @param {string[]} [params.tags]
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<object>} Created note record
 */
export async function createNote({
  userId,
  workspaceId = null,
  title,
  contentJson,
  contentText,
  pinned = false,
  collectionId = null,
  tags,
  pool = getPool(),
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const query = `
      INSERT INTO notes (user_id, workspace_id, title, content_json, content_text, pinned, collection_id, version)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, false), $7, 1)
      RETURNING id, title, content_json AS content, pinned, collection_id AS "collectionId", workspace_id AS "workspaceId", version, created_at AS "createdAt", updated_at AS "updatedAt";
    `;

    const values = [userId, workspaceId || null, title, JSON.stringify(contentJson), contentText, Boolean(pinned), collectionId || null];
    const result = await client.query(query, values);
    const createdNote = result.rows[0];

    let noteTags = [];
    if (tags !== undefined) {
      noteTags = await syncNoteTags({
        noteId: createdNote.id,
        userId,
        tagNames: tags,
        client,
      });
    }

    await client.query('COMMIT');
    return {
      ...createdNote,
      tags: noteTags,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists active notes for an authenticated user with optional workspace, search, collection filtering, tag filtering, and pagination.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.workspaceId=null]
 * @param {string} [params.q] - Search query
 * @param {string} [params.collectionId] - Optional collection filter UUID
 * @param {string} [params.tagId] - Optional tag filter UUID
 * @param {string} [params.tag] - Optional tag filter name
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ rawItems: object[], total: number, limit: number, offset: number, hasMore: boolean }>}
 */
export async function findNotesByUserId({
  userId,
  workspaceId = null,
  q = '',
  collectionId,
  tagId,
  tag,
  limit = 20,
  offset = 0,
  pool = getPool(),
}) {
  const conditions = ['notes.user_id = $1', 'notes.deleted_at IS NULL'];
  const values = [userId];

  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`notes.workspace_id = $${values.length}`);
  }

  if (typeof collectionId === 'string' && collectionId.trim().length > 0) {
    values.push(collectionId.trim());
    conditions.push(`notes.collection_id = $${values.length}`);
  }

  if (typeof tagId === 'string' && tagId.trim().length > 0) {
    values.push(tagId.trim());
    conditions.push(`EXISTS (
      SELECT 1 FROM note_tags nt
      JOIN tags t ON t.id = nt.tag_id
      WHERE nt.note_id = notes.id AND t.id = $${values.length} AND t.deleted_at IS NULL
    )`);
  } else if (typeof tag === 'string' && tag.trim().length > 0) {
    values.push(tag.trim().toLowerCase());
    conditions.push(`EXISTS (
      SELECT 1 FROM note_tags nt
      JOIN tags t ON t.id = nt.tag_id
      WHERE nt.note_id = notes.id AND LOWER(TRIM(t.name)) = $${values.length} AND t.deleted_at IS NULL
    )`);
  }

  const trimmedQuery = typeof q === 'string' ? q.trim() : '';
  if (trimmedQuery.length > 0) {
    const escaped = escapeLikeWildcards(trimmedQuery);
    values.push(`%${escaped}%`);
    const paramIdx = values.length;
    conditions.push(
      `(notes.title ILIKE $${paramIdx} ESCAPE '\\' OR notes.content_text ILIKE $${paramIdx} ESCAPE '\\')`
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
    SELECT notes.id, notes.title, notes.content_text, notes.pinned, notes.collection_id AS "collectionId", notes.workspace_id AS "workspaceId", notes.version, notes.created_at AS "createdAt", notes.updated_at AS "updatedAt"
    FROM notes
    WHERE ${conditions.join(' AND ')}
    ORDER BY notes.pinned DESC, notes.updated_at DESC, notes.id ASC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const result = await pool.query(query, selectValues);
  const hasMore = result.rows.length > limit;
  const rawItems = hasMore ? result.rows.slice(0, limit) : result.rows;

  // Batch-load tags for all returned notes
  const noteIds = rawItems.map((n) => n.id);
  const tagsMap = await findTagsByNoteIds({ noteIds, pool });

  const itemsWithTags = rawItems.map((note) => ({
    ...note,
    tags: tagsMap.get(note.id) || [],
  }));

  return {
    rawItems: itemsWithTags,
    total,
    limit,
    offset,
    hasMore,
  };
}

/**
 * Finds a single active note by ID scoped to the authenticated owner and optional workspace.
 *
 * @param {object} params
 * @param {string} params.id - Note UUID
 * @param {string} params.userId - Owner UUID
 * @param {string} [params.workspaceId] - Optional workspace UUID
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<object|null>}
 */
export async function findNoteByIdAndUserId({
  id,
  userId,
  workspaceId,
  pool = getPool(),
}) {
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const values = [id, userId];

  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    SELECT id, title, content_json AS content, pinned, collection_id AS "collectionId", workspace_id AS "workspaceId", version, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM notes
    WHERE ${conditions.join(' AND ')};
  `;

  const result = await pool.query(query, values);
  if (!result.rows[0]) return null;

  const noteTags = await findTagsByNoteId({ noteId: id, pool });
  return {
    ...result.rows[0],
    tags: noteTags,
  };
}

/**
 * Conditionally updates an active note using optimistic concurrency.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {string} [params.workspaceId]
 * @param {number} params.expectedVersion
 * @param {string} params.title
 * @param {object} params.contentJson
 * @param {string} params.contentText
 * @param {boolean} [params.pinned]
 * @param {string|null} [params.collectionId] - Optional collection UUID or null to unassign
 * @param {string[]} [params.tags]
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ updatedNote?: object, notFound?: boolean, conflict?: boolean }>}
 */
export async function updateNote({
  id,
  userId,
  workspaceId,
  expectedVersion,
  title,
  contentJson,
  contentText,
  pinned,
  collectionId,
  tags,
  pool = getPool(),
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const isCollectionProvided = collectionId !== undefined;

    const checkConditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
    const checkValues = [id, userId];
    if (workspaceId) {
      checkValues.push(workspaceId);
      checkConditions.push(`workspace_id = $${checkValues.length}`);
    }

    const existingRes = await client.query(
      `SELECT id, version FROM notes WHERE ${checkConditions.join(' AND ')}`,
      checkValues
    );

    if (!existingRes.rows[0]) {
      await client.query('ROLLBACK');
      return { notFound: true };
    }

    if (existingRes.rows[0].version !== expectedVersion) {
      await client.query('ROLLBACK');
      return { conflict: true, currentVersion: existingRes.rows[0].version };
    }

    const updateConditions = ['id = $7', 'user_id = $8', 'deleted_at IS NULL', 'version = $9'];
    const updateValues = [
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

    if (workspaceId) {
      updateValues.push(workspaceId);
      updateConditions.push(`workspace_id = $${updateValues.length}`);
    }

    const updateQuery = `
      UPDATE notes
      SET title = $1,
          content_json = $2,
          content_text = $3,
          pinned = COALESCE($4, pinned),
          collection_id = CASE WHEN $5::boolean THEN $6::uuid ELSE collection_id END,
          version = version + 1,
          updated_at = now()
      WHERE ${updateConditions.join(' AND ')}
      RETURNING id, title, content_json AS content, pinned, collection_id AS "collectionId", workspace_id AS "workspaceId", version, created_at AS "createdAt", updated_at AS "updatedAt";
    `;

    const result = await client.query(updateQuery, updateValues);
    const updatedNote = result.rows[0];

    if (!updatedNote) {
      await client.query('ROLLBACK');
      return { conflict: true, currentVersion: existingRes.rows[0].version };
    }

    let noteTags = [];
    if (tags !== undefined) {
      noteTags = await syncNoteTags({
        noteId: id,
        userId,
        tagNames: tags,
        client,
      });
    } else {
      noteTags = await findTagsByNoteId({ noteId: id, pool: client });
    }

    await client.query('COMMIT');
    return {
      updatedNote: {
        ...updatedNote,
        tags: noteTags,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Soft-deletes a note to trash using optimistic concurrency.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {string} [params.workspaceId]
 * @param {number} params.expectedVersion
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ success?: boolean, notFound?: boolean, conflict?: boolean }>}
 */
export async function trashNote({
  id,
  userId,
  workspaceId,
  expectedVersion,
  pool = getPool(),
}) {
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL', 'version = $3'];
  const values = [id, userId, expectedVersion];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const trashQuery = `
    UPDATE notes
    SET deleted_at = now(),
        updated_at = now(),
        version = version + 1
    WHERE ${conditions.join(' AND ')}
    RETURNING id;
  `;

  const result = await pool.query(trashQuery, values);
  if (result.rowCount === 1) {
    return { success: true };
  }

  // Disambiguate notFound vs conflict
  const checkConditions = ['id = $1'];
  const checkValues = [id];
  if (workspaceId) {
    checkValues.push(workspaceId);
    checkConditions.push(`workspace_id = $${checkValues.length}`);
  }

  const checkQuery = `
    SELECT user_id, version, deleted_at
    FROM notes
    WHERE ${checkConditions.join(' AND ')};
  `;

  const checkResult = await pool.query(checkQuery, checkValues);
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
 * @param {string} [params.workspaceId]
 * @param {boolean} params.pinned
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ updatedNote?: object, notFound?: boolean }>}
 */
export async function setNotePinned({
  id,
  userId,
  workspaceId,
  pinned,
  pool = getPool(),
}) {
  const conditions = ['id = $2', 'user_id = $3', 'deleted_at IS NULL'];
  const values = [Boolean(pinned), id, userId];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE notes
    SET pinned = $1,
        updated_at = now()
    WHERE ${conditions.join(' AND ')}
    RETURNING id, title, content_json AS content, pinned, collection_id AS "collectionId", workspace_id AS "workspaceId", version, created_at AS "createdAt", updated_at AS "updatedAt";
  `;

  const result = await pool.query(query, values);
  if (result.rowCount === 1) {
    const noteTags = await findTagsByNoteId({ noteId: id, pool });
    return { updatedNote: { ...result.rows[0], tags: noteTags } };
  }

  return { notFound: true };
}

/**
 * Lists soft-deleted (trashed) notes for an authenticated user with pagination.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.workspaceId]
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ rawItems: object[], total: number, limit: number, offset: number, hasMore: boolean }>}
 */
export async function findTrashedNotesByUserId({
  userId,
  workspaceId,
  limit = 20,
  offset = 0,
  pool = getPool(),
}) {
  const conditions = ['user_id = $1', 'deleted_at IS NOT NULL'];
  const values = [userId];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

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
    SELECT id, title, content_text, pinned, collection_id AS "collectionId", workspace_id AS "workspaceId", version, created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"
    FROM notes
    WHERE ${conditions.join(' AND ')}
    ORDER BY deleted_at DESC, updated_at DESC, id ASC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const result = await pool.query(query, selectValues);
  const hasMore = result.rows.length > limit;
  const rawItems = hasMore ? result.rows.slice(0, limit) : result.rows;

  const noteIds = rawItems.map((n) => n.id);
  const tagsMap = await findTagsByNoteIds({ noteIds, pool });

  const itemsWithTags = rawItems.map((note) => ({
    ...note,
    tags: tagsMap.get(note.id) || [],
  }));

  return {
    rawItems: itemsWithTags,
    total,
    limit,
    offset,
    hasMore,
  };
}

/**
 * Restores a soft-deleted note by setting deleted_at = NULL.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {string} [params.workspaceId]
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ restoredNote?: object, notFound?: boolean }>}
 */
export async function restoreNote({
  id,
  userId,
  workspaceId,
  pool = getPool(),
}) {
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NOT NULL'];
  const values = [id, userId];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE notes
    SET deleted_at = NULL,
        updated_at = now()
    WHERE ${conditions.join(' AND ')}
    RETURNING id, title, content_json AS content, pinned, collection_id AS "collectionId", workspace_id AS "workspaceId", version, created_at AS "createdAt", updated_at AS "updatedAt";
  `;

  const result = await pool.query(query, values);
  if (result.rowCount === 1) {
    const noteTags = await findTagsByNoteId({ noteId: id, pool });
    return { restoredNote: { ...result.rows[0], tags: noteTags } };
  }

  return { notFound: true };
}
