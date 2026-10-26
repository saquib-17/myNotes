import argon2 from 'argon2';

/**
 * OWASP-compliant Argon2id configuration options.
 * Selected parameters:
 * - type: Argon2id (hybrid robust against side-channel and GPU cracking)
 * - memoryCost: 19456 KiB (~19 MiB, per OWASP minimum recommendation)
 * - timeCost: 2 iterations
 * - parallelism: 1 lane
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Precomputed dummy Argon2id hash used to mitigate timing-based account enumeration attacks.
 * Generated with the exact same parameters as real password hashes.
 */
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$WEiYRk2cdjb0/ZidWeHA8w$hi1YDR/Nuxn8ACSUbadEC4JnU+vDvHv0tm45IkZBinQ';

const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 128;

/**
 * Validates password length and type according to the project password policy.
 * - Minimum 15 characters
 * - Maximum 128 characters
 * - Allows spaces and Unicode
 * - Does not silently trim, lowercase, or truncate
 *
 * @param {unknown} password
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePassword(password) {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password must be a string.' };
  }

  // Preserve exact characters without trimming; check string length
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`,
    };
  }

  return { valid: true };
}

/**
 * Hashes a plaintext password using Argon2id with explicit OWASP parameters.
 *
 * @param {string} password - Raw password
 * @returns {Promise<string>} Encoded Argon2id hash
 */
export async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 *
 * @param {string} hash - Encoded hash
 * @param {string} password - Raw password
 * @returns {Promise<boolean>} True if matching, false otherwise
 */
export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Performs a constant-work dummy verification when an unknown email is encountered.
 * Simulates real hash verification without calculating a new hash on each request.
 *
 * @param {string} password - Raw attempted password
 * @returns {Promise<boolean>} Always resolves to false
 */
export async function verifyDummyPassword(password) {
  try {
    await argon2.verify(DUMMY_HASH, password);
  } catch {
    // Ignore verification errors on dummy hash
  }
  return false;
}
