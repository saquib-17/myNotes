import { getPool } from '../db/pool.js';

export const WORKSPACE_LIMITS = {
  MIN_NAME_LENGTH: 1,
  MAX_NAME_LENGTH: 60,
};

export class DuplicateWorkspaceNameError extends Error {
  constructor(message = 'A workspace with this name already exists.') {
    super(message);
    this.name = 'DuplicateWorkspaceNameError';
    this.code = 'DUPLICATE_WORKSPACE_NAME';
    this.status = 409;
  }
}

/**
 * Validates and normalizes workspace name.
 *
 * @param {string} name
 * @returns {string} Trimmed name
 */
export function validateWorkspaceName(name) {
  if (typeof name !== 'string') {
    const err = new Error('Workspace name must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = name.trim();
  if (trimmed.length < WORKSPACE_LIMITS.MIN_NAME_LENGTH) {
    const err = new Error('Workspace name cannot be empty.');
    err.status = 400;
    throw err;
  }
  if (trimmed.length > WORKSPACE_LIMITS.MAX_NAME_LENGTH) {
    const err = new Error(
      `Workspace name cannot exceed ${WORKSPACE_LIMITS.MAX_NAME_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Creates a new workspace for an authenticated user.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.name
 * @param {boolean} [params.isDefault=false]
 * @param {object} [params.pool]
 * @returns {Promise<object>} Created workspace
 */
export async function createWorkspace({
  userId,
  name,
  isDefault = false,
  pool = getPool(),
}) {
  if (!userId) {
    const err = new Error('userId is required.');
    err.status = 400;
    throw err;
  }
  const normalizedName = validateWorkspaceName(name);

  try {
    const result = await pool.query(
      `
      INSERT INTO workspaces (user_id, name, is_default)
      VALUES ($1, $2, $3)
      RETURNING id, name, is_default, is_default AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"
      `,
      [userId, normalizedName, Boolean(isDefault)]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint === 'idx_workspaces_user_active_name' || err.message.includes('name')) {
        throw new DuplicateWorkspaceNameError(
          `A workspace named "${normalizedName}" already exists.`
        );
      }
    }
    throw err;
  }
}

/**
 * Lists all active workspaces for a user, sorted default first, then name ascending, then id ascending.
 * Supports both findWorkspacesByUserId(userId, pool) and findWorkspacesByUserId({ userId, pool }).
 *
 * @param {string|object} userIdOrParams
 * @param {object} [maybePool]
 * @returns {Promise<Array<object>>}
 */
export async function findWorkspacesByUserId(userIdOrParams, maybePool) {
  let userId;
  let pool;
  if (userIdOrParams && typeof userIdOrParams === 'object') {
    userId = userIdOrParams.userId;
    pool = userIdOrParams.pool || getPool();
  } else {
    userId = userIdOrParams;
    pool = maybePool || getPool();
  }
  if (!userId) return [];
  const result = await pool.query(
    `
    SELECT id, name, is_default, is_default AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM workspaces
    WHERE user_id = $1 AND deleted_at IS NULL
    ORDER BY is_default DESC, LOWER(TRIM(name)) ASC, id ASC
    `,
    [userId]
  );
  return result.rows;
}

/**
 * Finds a specific active workspace by ID and user ID.
 * Supports both findWorkspaceByIdAndUserId(id, userId, pool) and findWorkspaceByIdAndUserId({ id, userId, pool }).
 *
 * @param {string|object} idOrParams
 * @param {string} [maybeUserId]
 * @param {object} [maybePool]
 * @returns {Promise<object|null>}
 */
export async function findWorkspaceByIdAndUserId(idOrParams, maybeUserId, maybePool) {
  let id;
  let userId;
  let pool;
  if (idOrParams && typeof idOrParams === 'object') {
    id = idOrParams.id;
    userId = idOrParams.userId;
    pool = idOrParams.pool || getPool();
  } else {
    id = idOrParams;
    userId = maybeUserId;
    pool = maybePool || getPool();
  }
  if (!id || !userId) return null;
  const result = await pool.query(
    `
    SELECT id, name, is_default, is_default AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM workspaces
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    `,
    [id, userId]
  );
  return result.rows[0] || null;
}

/**
 * Finds the user's active default workspace. Falls back to first active workspace if none is marked default.
 * Supports both findDefaultWorkspaceByUserId(userId, pool) and findDefaultWorkspaceByUserId({ userId, pool }).
 *
 * @param {string|object} userIdOrParams
 * @param {object} [maybePool]
 * @returns {Promise<object|null>}
 */
export async function findDefaultWorkspaceByUserId(userIdOrParams, maybePool) {
  let userId;
  let pool;
  if (userIdOrParams && typeof userIdOrParams === 'object') {
    userId = userIdOrParams.userId;
    pool = userIdOrParams.pool || getPool();
  } else {
    userId = userIdOrParams;
    pool = maybePool || getPool();
  }
  if (!userId) return null;
  const result = await pool.query(
    `
    SELECT id, name, is_default, is_default AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM workspaces
    WHERE user_id = $1 AND deleted_at IS NULL
    ORDER BY is_default DESC, LOWER(TRIM(name)) ASC, id ASC
    LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Renames an active workspace.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {string} params.name
 * @param {object} [params.pool]
 * @returns {Promise<object>}
 */
export async function updateWorkspace({
  id,
  userId,
  name,
  pool = getPool(),
}) {
  if (!id || !userId) {
    const err = new Error('id and userId are required.');
    err.status = 400;
    throw err;
  }
  const normalizedName = validateWorkspaceName(name);

  // Check existence
  const existing = await findWorkspaceByIdAndUserId(id, userId, pool);
  if (!existing) {
    const err = new Error('Workspace not found.');
    err.status = 404;
    throw err;
  }

  try {
    const result = await pool.query(
      `
      UPDATE workspaces
      SET name = $1, updated_at = now()
      WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
      RETURNING id, name, is_default, is_default AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"
      `,
      [normalizedName, id, userId]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new DuplicateWorkspaceNameError(
        `A workspace named "${normalizedName}" already exists.`
      );
    }
    throw err;
  }
}

/**
 * Soft deletes an active workspace.
 * Prevents deleting the user's only active workspace or the default workspace.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {object} [params.pool]
 * @returns {Promise<boolean>}
 */
export async function softDeleteWorkspace({
  id,
  userId,
  pool = getPool(),
}) {
  if (!id || !userId) {
    const err = new Error('id and userId are required.');
    err.status = 400;
    throw err;
  }

  const existing = await findWorkspaceByIdAndUserId(id, userId, pool);
  if (!existing) {
    const err = new Error('Workspace not found.');
    err.status = 404;
    throw err;
  }

  if (existing.isDefault) {
    const err = new Error(
      'Cannot delete the default workspace. Please set another workspace as default first.'
    );
    err.status = 400;
    throw err;
  }

  // Check active count
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM workspaces WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  if ((countRes.rows[0]?.count || 0) <= 1) {
    const err = new Error('Cannot delete your only active workspace.');
    err.status = 400;
    throw err;
  }

  await pool.query(
    `
    UPDATE workspaces
    SET deleted_at = now(), updated_at = now()
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    `,
    [id, userId]
  );

  return true;
}

/**
 * Sets a workspace as default and unsets is_default on any previous default workspace.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.userId
 * @param {object} [params.pool]
 * @returns {Promise<object>} Updated workspace
 */
export async function setDefaultWorkspace({
  id,
  userId,
  pool = getPool(),
}) {
  if (!id || !userId) {
    const err = new Error('id and userId are required.');
    err.status = 400;
    throw err;
  }

  const target = await findWorkspaceByIdAndUserId(id, userId, pool);
  if (!target) {
    const err = new Error('Workspace not found.');
    err.status = 404;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Unset default on previous
    await client.query(
      `
      UPDATE workspaces
      SET is_default = false, updated_at = now()
      WHERE user_id = $1 AND is_default = true AND deleted_at IS NULL AND id != $2
      `,
      [userId, id]
    );

    // Set default on target
    const result = await client.query(
      `
      UPDATE workspaces
      SET is_default = true, updated_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING id, name, is_default, is_default AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"
      `,
      [id, userId]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ensures user has at least one active default workspace (creating "Default" if none exists).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {object} [params.pool]
 * @returns {Promise<object>}
 */
export async function ensureDefaultWorkspaceForUser({
  userId,
  pool = getPool(),
}) {
  if (!userId) return null;
  const existingDefault = await findDefaultWorkspaceByUserId(userId, pool);
  if (existingDefault) return existingDefault;

  // Insert Default workspace
  try {
    return await createWorkspace({
      userId,
      name: 'Default',
      isDefault: true,
      pool,
    });
  } catch {
    // In case of race condition
    return await findDefaultWorkspaceByUserId(userId, pool);
  }
}
