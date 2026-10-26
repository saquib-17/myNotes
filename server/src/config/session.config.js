/**
 * Session Configuration Module
 * Validates session secret and defines cookie security parameters.
 * Never prints or leaks secrets or raw configuration objects.
 */

const MIN_SECRET_LENGTH = 32;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Validates and retrieves the session secret from environment variables.
 * Throws a descriptive error if missing or insufficiently long.
 *
 * @returns {string}
 */
export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Session configuration error: Missing or invalid SESSION_SECRET. ` +
      `Please ensure server/.env defines a high-entropy secret of at least ${MIN_SECRET_LENGTH} characters. ` +
      'Generate one locally using: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"'
    );
  }
  return secret.trim();
}

/**
 * Generates express-session configuration with explicit security attributes.
 *
 * @param {object} [options]
 * @param {import('express-session').Store} [options.store] - Session persistence store
 * @param {string} [options.secret] - Optional secret override (used in test injection)
 * @param {boolean} [options.secure] - Optional HTTPS secure flag override
 * @returns {import('express-session').SessionOptions}
 */
export function getSessionOptions({ store, secret, secure } = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const effectiveSecure = typeof secure === 'boolean' ? secure : isProduction;
  const effectiveSecret = secret || getSessionSecret();

  return {
    name: 'mynotes.sid',
    secret: effectiveSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: effectiveSecure,
      maxAge: SEVEN_DAYS_MS,
    },
  };
}
