import { query } from '../db/pool.js';

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

    return result.rows[0];
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
    `SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt"
     FROM users
     WHERE lower(trim(email)) = lower(trim($1));`,
    [normalized]
  );

  return result.rows[0] || null;
}

/**
 * Finds a user by unique identifier, returning only public non-secret fields.
 *
 * @param {string} id - User UUID
 * @param {Function} [customQuery] - Optional query function override for testing
 * @returns {Promise<{ id: string, email: string, createdAt: Date } | null>}
 */
export async function findUserById(id, customQuery = query) {
  const result = await customQuery(
    `SELECT id, email, created_at AS "createdAt"
     FROM users
     WHERE id = $1;`,
    [id]
  );

  return result.rows[0] || null;
}
