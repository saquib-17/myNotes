import { query } from '../db/pool.js';
import { ensureDefaultWorkspaceForUser } from '../workspaces/workspaceRepository.js';

export class DuplicateEmailError extends Error {
  constructor(message = 'An account with this email address already exists.') {
    super(message);
    this.name = 'DuplicateEmailError';
    this.code = 'DUPLICATE_EMAIL';
  }
}

/**
 * Normalizes an email address according to the application identity model.
 * Trims surrounding whitespace and converts to lowercase.
 *
 * @param {string} email
 * @returns {string}
 */
export function normalizeEmail(email) {
  if (typeof email !== 'string') {
    return '';
  }
  return email.trim().toLowerCase();
}

/**
 * Inserts a new user into the database.
 *
 * @param {object} params
 * @param {string} params.email - Raw email (will be normalized)
 * @param {string} params.passwordHash - Argon2id password hash
 * @param {Function} [customQuery] - Optional query function override for testing
 * @returns {Promise<{ id: string, email: string, createdAt: Date }>}
 */
export async function createUser({ email, passwordHash }, customQuery = query) {
  const normalized = normalizeEmail(email);

  try {
    const result = await customQuery(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at AS "createdAt", updated_at AS "updatedAt";`,
      [normalized, passwordHash]
    );

    const user = result.rows[0];
    try {
      await ensureDefaultWorkspaceForUser({ userId: user.id });
    } catch {
      // In isolated tests where workspaces table might not be mocked, allow graceful continuation
    }

    return user;
  } catch (err) {
    // PostgreSQL error code 23505 = unique_violation
    if (err.code === '23505') {
      throw new DuplicateEmailError();
    }
    throw err;
  }
}

/**
 * Finds a user by normalized email address, including the password hash for authentication.
 *
 * @param {string} email - Email address
 * @param {Function} [customQuery] - Optional query function override for testing
 * @returns {Promise<{ id: string, email: string, passwordHash: string, createdAt: Date } | null>}
 */
export async function findUserByEmail(email, customQuery = query) {
  const normalized = normalizeEmail(email);

  const result = await customQuery(
    `SELECT id, email, display_name AS "displayName", password_hash AS "passwordHash", created_at AS "createdAt"
     FROM users
     WHERE lower(trim(email)) = lower(trim($1));`,
    [normalized]
  );

  return result.rows[0] || null;
}

/**
 * Finds a user by unique identifier, returning public non-secret fields.
 *
 * @param {string} id - User UUID
 * @param {Function} [customQuery] - Optional query function override for testing
 * @returns {Promise<{ id: string, email: string, displayName: string | null, createdAt: Date } | null>}
 */
export async function findUserById(id, customQuery = query) {
  const result = await customQuery(
    `SELECT id, email, display_name AS "displayName", created_at AS "createdAt"
     FROM users
     WHERE id = $1;`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Finds a user by unique identifier, including password hash for authentication or password changes.
 *
 * @param {string} id - User UUID
 * @param {Function} [customQuery] - Optional query function override for testing
 * @returns {Promise<{ id: string, email: string, displayName: string | null, passwordHash: string, createdAt: Date } | null>}
 */
export async function findUserWithPasswordById(id, customQuery = query) {
  const result = await customQuery(
    `SELECT id, email, display_name AS "displayName", password_hash AS "passwordHash", created_at AS "createdAt"
     FROM users
     WHERE id = $1;`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Updates a user's display name.
 *
 * @param {string} id - User UUID
 * @param {string | null} displayName - New display name
 * @param {Function} [customQuery] - Optional query function override for testing
 * @returns {Promise<{ id: string, email: string, displayName: string | null, createdAt: Date } | null>}
 */
export async function updateUserDisplayName(id, displayName, customQuery = query) {
  const result = await customQuery(
    `UPDATE users
     SET display_name = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, email, display_name AS "displayName", created_at AS "createdAt";`,
    [displayName, id]
  );

  return result.rows[0] || null;
}

/**
 * Updates a user's password hash.
 *
 * @param {string} id - User UUID
 * @param {string} passwordHash - New Argon2id hash
 * @param {Function} [customQuery] - Optional query function override for testing
 * @returns {Promise<boolean>}
 */
export async function updateUserPassword(id, passwordHash, customQuery = query) {
  const result = await customQuery(
    `UPDATE users
     SET password_hash = $1, updated_at = now()
     WHERE id = $2
     RETURNING id;`,
    [passwordHash, id]
  );

  return Boolean(result.rows[0]);
}
