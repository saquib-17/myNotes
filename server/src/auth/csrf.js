import crypto from 'node:crypto';

/**
 * Generates a high-entropy cryptographically secure CSRF token.
 *
 * @returns {string} 64-character hex string (256 bits of entropy)
 */
export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Compares two tokens using a constant-time comparison to prevent timing attacks.
 *
 * @param {string} tokenA
 * @param {string} tokenB
 * @returns {boolean}
 */
export function timingSafeTokenEqual(tokenA, tokenB) {
  if (
    !tokenA ||
    !tokenB ||
    typeof tokenA !== 'string' ||
    typeof tokenB !== 'string'
  ) {
    return false;
  }

  const bufA = Buffer.from(tokenA);
  const bufB = Buffer.from(tokenB);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Sets strict cache-control headers on sensitive authentication and token responses.
 *
 * @param {import('express').Response} res
 */
export function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

/**
 * Validates request Origin against the allowed client origin.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isValidOrigin(req) {
  const origin = req.headers.origin;
  // If no Origin header (e.g. server-to-server, curl, or standard GET), let other checks govern
  if (!origin) {
    return true;
  }

  const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  return origin === allowedOrigin;
}

/**
 * Express middleware requiring a valid Origin and matching session-bound CSRF token
 * on state-changing requests (POST, PUT, DELETE, PATCH).
 */
export function requireCsrf(req, res, next) {
  // 1. Validate request origin
  if (!isValidOrigin(req)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Disallowed request origin.',
    });
  }

  // 2. Validate session existence
  if (!req.session) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid or missing CSRF session.',
    });
  }

  // 3. Validate CSRF token header
  const submittedToken = req.headers['x-csrf-token'];
  const sessionToken = req.session.csrfToken;

  if (!submittedToken || !sessionToken || !timingSafeTokenEqual(submittedToken, sessionToken)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid or missing CSRF token.',
    });
  }

  return next();
}
