import { getPool } from '../db/pool.js';

/**
 * Validates and normalizes a collection name.
 * Throws an Error with status 400 if invalid.
 *
 * @param {string} name
 * @returns {string}
 */
export function validateAndNormalizeCollectionName(name) {
  if (typeof name !== 'string') {
    const err = new Error('Collection name must be a string.');
    err.status = 400;
    throw err;
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    const err = new Error('Collection name cannot be empty or blank.');
    err.status = 400;
    throw err;
  }

  if (trimmed.length > 80) {
    const err = new Error('Collection name cannot exceed 80 characters.');
    err.status = 400;
    throw err;
  }

  return trimmed;
}

/**
 * Lists all active collections for a user with their note count.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<Array<object>>}
 */
export async function findCollectionsByUserId({
  userId,
  pool = getPool(),
}) {
  const query = `
    SELECT c.id, c.name, c.created_at AS "createdAt", c.updated_at AS "updatedAt",
           COUNT(n.id)::int AS "noteCount"
    FROM collections c
    LEFT JOIN notes n ON n.collection_id = c.id AND n.deleted_at IS NULL
    WHERE c.user_id = $1 AND c.deleted_at IS NULL
    GROUP BY c.id, c.name, c.created_at, c.updated_at
    ORDER BY c.name ASC, c.id ASC;
  `;

  const result = await pool.query(query, [userId]);
  return result.rows;
}

/**
 * Finds a single active collection by ID and owner.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<object|null>}
 */
export async function findCollectionByIdAndUserId({
  id,
  userId,
  pool = getPool(),
}) {
  const query = `
    SELECT id, name, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM collections
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;
  `;

  const result = await pool.query(query, [id, userId]);
  return result.rows[0] || null;
}

/**
 * Creates a new collection for a user.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.name
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ collection?: object, conflict?: boolean }>}
 */
export async function createCollection({
  userId,
  name,
  pool = getPool(),
}) {
  const normalizedName = validateAndNormalizeCollectionName(name);

  const query = `
    INSERT INTO collections (user_id, name)
    VALUES ($1, $2)
    RETURNING id, name, created_at AS "createdAt", updated_at AS "updatedAt";
  `;

  try {
    const result = await pool.query(query, [userId, normalizedName]);
    return {
      collection: {
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
 * Renames an active collection for a user.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {string} params.name
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ collection?: object, notFound?: boolean, conflict?: boolean }>}
 */
export async function updateCollection({
  id,
  userId,
  name,
  pool = getPool(),
}) {
  const normalizedName = validateAndNormalizeCollectionName(name);

  const query = `
    UPDATE collections
    SET name = $1, updated_at = now()
    WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
    RETURNING id, name, created_at AS "createdAt", updated_at AS "updatedAt";
  `;

  try {
    const result = await pool.query(query, [normalizedName, id, userId]);
    if (result.rowCount === 1) {
      return { collection: result.rows[0] };
    }
    return { notFound: true };
  } catch (err) {
    if (err.code === '23505') {
      return { conflict: true };
    }
    throw err;
  }
}

/**
 * Soft-deletes a collection and sets collection_id = NULL for all its notes.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {import('pg').Pool} [params.pool]
 * @returns {Promise<{ success?: boolean, notFound?: boolean }>}
 */
export async function softDeleteCollection({
  id,
  userId,
  pool = getPool(),
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Soft delete collection
    const deleteQuery = `
      UPDATE collections
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING id;
    `;
    const deleteResult = await client.query(deleteQuery, [id, userId]);

    if (deleteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { notFound: true };
    }

    // Clear collection_id on notes belonging to this collection and user
    const unassignQuery = `
      UPDATE notes
      SET collection_id = NULL
      WHERE collection_id = $1 AND user_id = $2;
    `;
    await client.query(unassignQuery, [id, userId]);

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

