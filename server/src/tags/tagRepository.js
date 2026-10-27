import { getPool } from '../db/pool.js';

export const TAG_LIMITS = {
  MAX_NAME_LENGTH: 40,
  MAX_TAGS_PER_NOTE: 20,
};

/**
 * Validates and normalizes a tag name.
 * Trims leading/trailing whitespace, collapses internal whitespace, and enforces 1..40 char length.
 * Throws an Error with status 400 if invalid.
 *
 * @param {string} name
 * @returns {string} Normalized tag name
 */
export function validateAndNormalizeTagName(name) {
  if (typeof name !== 'string') {
    const err = new Error('Tag name must be a string.');
    err.status = 400;
    throw err;
  }

  const normalized = name.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    const err = new Error('Tag name cannot be empty or blank.');
    err.status = 400;
    throw err;
  }

  if (normalized.length > TAG_LIMITS.MAX_NAME_LENGTH) {
    const err = new Error(`Tag name cannot exceed ${TAG_LIMITS.MAX_NAME_LENGTH} characters.`);
    err.status = 400;
    throw err;
  }

  return normalized;
}

/**
 * Validates an array of tag names for a note.
 * Deduplicates case-insensitively and enforces max 20 tags per note.
 *
 * @param {Array<string>} tags
 * @returns {Array<string>} Normalized, deduplicated tag names
 */
export function validateAndNormalizeNoteTags(tags) {
  if (!Array.isArray(tags)) {
    const err = new Error('Tags must be an array of strings.');
    err.status = 400;
    throw err;
  }

  if (tags.length > TAG_LIMITS.MAX_TAGS_PER_NOTE) {
    const err = new Error(`A note cannot have more than ${TAG_LIMITS.MAX_TAGS_PER_NOTE} tags.`);
    err.status = 400;
    throw err;
  }

  const seen = new Set();
  const normalizedList = [];

  for (const rawName of tags) {
    const normalized = validateAndNormalizeTagName(rawName);
    const lowerKey = normalized.toLowerCase();
    if (!seen.has(lowerKey)) {
      seen.add(lowerKey);
      normalizedList.push(normalized);
    }
  }

  if (normalizedList.length > TAG_LIMITS.MAX_TAGS_PER_NOTE) {
    const err = new Error(`A note cannot have more than ${TAG_LIMITS.MAX_TAGS_PER_NOTE} tags.`);
    err.status = 400;
    throw err;
  }

  return normalizedList;
}

/**
 * Lists all active tags for a user with their active note count.
 * Excludes trashed notes from count.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<Array<{ id: string, name: string, noteCount: number, createdAt: string, updatedAt: string }>>}
 */
export async function findTagsByUserId({
  userId,
  pool = getPool(),
}) {
  const query = `
    SELECT t.id, t.name, t.created_at AS "createdAt", t.updated_at AS "updatedAt",
           COUNT(n.id) FILTER (WHERE n.deleted_at IS NULL)::int AS "noteCount"
    FROM tags t
    LEFT JOIN note_tags nt ON nt.tag_id = t.id
    LEFT JOIN notes n ON n.id = nt.note_id AND n.deleted_at IS NULL
    WHERE t.user_id = $1 AND t.deleted_at IS NULL
    GROUP BY t.id, t.name, t.created_at, t.updated_at
    ORDER BY LOWER(t.name) ASC, t.id ASC;
  `;

  const result = await pool.query(query, [userId]);
  return result.rows;
}

/**
 * Finds a single active tag by ID and owner.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<object|null>}
 */
export async function findTagByIdAndUserId({
  id,
  userId,
  pool = getPool(),
}) {
  const query = `
    SELECT id, name, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM tags
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;
  `;

  const result = await pool.query(query, [id, userId]);
  return result.rows[0] || null;
}

/**
 * Creates a new tag for the authenticated user.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.name
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ tag?: object, conflict?: boolean }>}
 */
export async function createTag({
  userId,
  name,
  pool = getPool(),
}) {
  const normalized = validateAndNormalizeTagName(name);

  // Check if a soft-deleted tag with this name exists for this user.
  // If so, resurrect it; otherwise insert a new active tag.
  const resurrectQuery = `
    UPDATE tags
    SET deleted_at = NULL, name = $1, updated_at = NOW()
    WHERE id = (
      SELECT id FROM tags
      WHERE user_id = $2 AND LOWER(TRIM(name)) = LOWER($1) AND deleted_at IS NOT NULL
      LIMIT 1
    )
    RETURNING id, name, created_at AS "createdAt", updated_at AS "updatedAt";
  `;
  const resurrectRes = await pool.query(resurrectQuery, [normalized, userId]);
  if (resurrectRes.rowCount === 1) {
    return {
      tag: {
        ...resurrectRes.rows[0],
        noteCount: 0,
      },
    };
  }

  const query = `
    INSERT INTO tags (user_id, name)
    VALUES ($1, $2)
    RETURNING id, name, created_at AS "createdAt", updated_at AS "updatedAt";
  `;

  try {
    const result = await pool.query(query, [userId, normalized]);
    return {
      tag: {
        ...result.rows[0],
        noteCount: 0,
      },
    };
  } catch (err) {
    if (err.code === '23505') {
      return { conflict: true };
    }
    throw err;
  }
}

/**
 * Renames an active tag.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {string} params.name
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ tag?: object, conflict?: boolean, notFound?: boolean }>}
 */
export async function updateTag({
  id,
  userId,
  name,
  pool = getPool(),
}) {
  const normalized = validateAndNormalizeTagName(name);

  const query = `
    UPDATE tags
    SET name = $1, updated_at = now()
    WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
    RETURNING id, name, created_at AS "createdAt", updated_at AS "updatedAt";
  `;

  try {
    const result = await pool.query(query, [normalized, id, userId]);
    if (result.rowCount === 0) {
      return { notFound: true };
    }
    return { tag: result.rows[0] };
  } catch (err) {
    if (err.code === '23505') {
      return { conflict: true };
    }
    throw err;
  }
}

/**
 * Soft-deletes a tag and deletes its note_tags associations.
 * Does not delete notes.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ success?: boolean, notFound?: boolean }>}
 */
export async function deleteTag({
  id,
  userId,
  pool = getPool(),
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove join table entries
    await client.query(
      `DELETE FROM note_tags WHERE tag_id = $1 AND tag_id IN (SELECT id FROM tags WHERE id = $1 AND user_id = $2)`,
      [id, userId]
    );

    // Soft-delete the tag
    const updateResult = await client.query(
      `UPDATE tags SET deleted_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
      [id, userId]
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { notFound: true };
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Finds or creates active tags by an array of names for a given user.
 * Reuses existing tags (case-insensitive) or creates new ones.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {Array<string>} params.names - Array of normalized tag names
 * @param {import('pg').PoolClient|import('pg').Pool} [params.clientOrPool]
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function findOrCreateTagsByNames({
  userId,
  names,
  clientOrPool = getPool(),
}) {
  if (!names || names.length === 0) return [];

  const results = [];

  for (const name of names) {
    const normalized = validateAndNormalizeTagName(name);

    // Look for existing active tag
    const findQuery = `
      SELECT id, name FROM tags
      WHERE user_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND deleted_at IS NULL
      LIMIT 1;
    `;
    const findRes = await clientOrPool.query(findQuery, [userId, normalized]);

    if (findRes.rows.length > 0) {
      results.push(findRes.rows[0]);
    } else {
      // Check if soft-deleted tag exists and resurrect it
      const resurrectQuery = `
        UPDATE tags
        SET deleted_at = NULL, name = $1, updated_at = NOW()
        WHERE id = (
          SELECT id FROM tags
          WHERE user_id = $2 AND LOWER(TRIM(name)) = LOWER($1) AND deleted_at IS NOT NULL
          LIMIT 1
        )
        RETURNING id, name;
      `;
      const resRes = await clientOrPool.query(resurrectQuery, [normalized, userId]);
      if (resRes.rows.length > 0) {
        results.push(resRes.rows[0]);
      } else {
        // Insert new tag
        try {
          const insertQuery = `
            INSERT INTO tags (user_id, name)
            VALUES ($1, $2)
            RETURNING id, name;
          `;
          const insertRes = await clientOrPool.query(insertQuery, [userId, normalized]);
          results.push(insertRes.rows[0]);
        } catch (err) {
          if (err.code === '23505') {
            // Concurrently created: re-query
            const retryRes = await clientOrPool.query(findQuery, [userId, normalized]);
            if (retryRes.rows.length > 0) {
              results.push(retryRes.rows[0]);
            }
          } else {
            throw err;
          }
        }
      }
    }
  }

  return results;
}

/**
 * Replaces the tag set on a note with the provided array of tag names.
 *
 * @param {object} params
 * @param {string} params.noteId
 * @param {string} params.userId
 * @param {Array<string>} params.tagNames
 * @param {import('pg').PoolClient} params.client
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function syncNoteTags({
  noteId,
  userId,
  tagNames,
  client,
}) {
  const normalizedNames = validateAndNormalizeNoteTags(tagNames || []);

  // Remove existing note_tags
  await client.query(`DELETE FROM note_tags WHERE note_id = $1;`, [noteId]);

  if (normalizedNames.length === 0) {
    return [];
  }

  const tags = await findOrCreateTagsByNames({
    userId,
    names: normalizedNames,
    clientOrPool: client,
  });

  for (const tag of tags) {
    await client.query(
      `INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
      [noteId, tag.id]
    );
  }

  return tags;
}

/**
 * Returns tags for a single note.
 *
 * @param {object} params
 * @param {string} params.noteId
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function findTagsByNoteId({
  noteId,
  pool = getPool(),
}) {
  const query = `
    SELECT t.id, t.name
    FROM tags t
    JOIN note_tags nt ON nt.tag_id = t.id
    WHERE nt.note_id = $1 AND t.deleted_at IS NULL
    ORDER BY LOWER(t.name) ASC, t.id ASC;
  `;

  const result = await pool.query(query, [noteId]);
  return result.rows;
}

/**
 * Batch loads tags for multiple note IDs.
 *
 * @param {object} params
 * @param {Array<string>} params.noteIds
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<Map<string, Array<{ id: string, name: string }>>>}
 */
export async function findTagsByNoteIds({
  noteIds,
  pool = getPool(),
}) {
  const map = new Map();
  if (!noteIds || noteIds.length === 0) return map;

  const query = `
    SELECT nt.note_id AS "noteId", t.id, t.name
    FROM tags t
    JOIN note_tags nt ON nt.tag_id = t.id
    WHERE nt.note_id = ANY($1) AND t.deleted_at IS NULL
    ORDER BY LOWER(t.name) ASC, t.id ASC;
  `;

  const result = await pool.query(query, [noteIds]);
  for (const row of result.rows) {
    if (!map.has(row.noteId)) {
      map.set(row.noteId, []);
    }
    map.get(row.noteId).push({ id: row.id, name: row.name });
  }

  return map;
}

