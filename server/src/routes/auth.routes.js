import { Router } from 'express';
import {
  generateCsrfToken,
  requireCsrf,
  setNoCacheHeaders,
} from '../auth/csrf.js';
import {
  validatePassword,
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
} from '../auth/password.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
  normalizeEmail,
  DuplicateEmailError,
} from '../auth/userRepository.js';
import { createRequireAuth } from '../auth/requireAuth.js';
import { loginLimiter, registerLimiter } from '../auth/rateLimiter.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

/**
 * Creates authentication router with configurable dependencies for testing.
 *
 * @param {object} [options]
 * @param {typeof createUser} [options.createUserFn]
 * @param {typeof findUserByEmail} [options.findUserByEmailFn]
 * @param {typeof findUserById} [options.findUserByIdFn]
 * @param {import('../auth/rateLimiter.js').RateLimiter} [options.customLoginLimiter]
 * @param {import('../auth/rateLimiter.js').RateLimiter} [options.customRegisterLimiter]
 * @returns {Router}
 */
export function createAuthRouter({
  createUserFn = createUser,
  findUserByEmailFn = findUserByEmail,
  findUserByIdFn = findUserById,
  customLoginLimiter = loginLimiter,
  customRegisterLimiter = registerLimiter,
} = {}) {
  const router = Router();
  const requireAuthMiddleware = createRequireAuth({ getUserById: findUserByIdFn });

  // Apply no-cache headers to all authentication endpoints
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });

  /**
   * GET /api/auth/csrf
   * Establishes an anonymous session and provides a session-bound CSRF token.
   */
  router.get('/csrf', (req, res) => {
    if (!req.session) {
      return res.status(500).json({
        error: 'InternalServerError',
        message: 'Session middleware unavailable.',
      });
    }

    if (!req.session.csrfToken) {
      req.session.csrfToken = generateCsrfToken();
    }

    return res.status(200).json({
      csrfToken: req.session.csrfToken,
    });
  });

  /**
   * POST /api/auth/register
   * Registers a new user account without auto-login in Stage 3A.
   */
  router.post(
    '/register',
    customRegisterLimiter.middleware(),
    requireCsrf,
    async (req, res, next) => {
      const { email, password } = req.body || {};

      // 1. Email validation
      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'A valid email address is required.',
        });
      }

      const normalizedEmail = normalizeEmail(email);
      if (
        normalizedEmail.length > MAX_EMAIL_LENGTH ||
        !EMAIL_REGEX.test(normalizedEmail)
      ) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid email address format.',
        });
      }

      // 2. Password validation
      const passwordCheck = validatePassword(password);
      if (!passwordCheck.valid) {
        return res.status(400).json({
          error: 'BadRequest',
          message: passwordCheck.error,
        });
      }

      // 3. User insertion
      try {
        const passwordHash = await hashPassword(password);
        const newUser = await createUserFn({
          email: normalizedEmail,
          passwordHash,
        });

        return res.status(201).json({
          user: {
            id: newUser.id,
            email: newUser.email,
            createdAt: newUser.createdAt,
          },
        });
      } catch (err) {
        if (err instanceof DuplicateEmailError) {
          return res.status(409).json({
            error: 'Conflict',
            message: 'An account with this email address already exists.',
          });
        }
        return next(err);
      }
    }
  );

  /**
   * POST /api/auth/login
   * Authenticates user credentials, regenerates session, and rotates CSRF token.
   */
  router.post(
    '/login',
    customLoginLimiter.middleware(),
    requireCsrf,
    async (req, res, next) => {
      const { email, password } = req.body || {};
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      if (
        !email ||
        !password ||
        typeof email !== 'string' ||
        typeof password !== 'string'
      ) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Email and password are required.',
        });
      }

      try {
        const user = await findUserByEmailFn(email);

        // Account not found: execute constant-time dummy verify to prevent timing enumeration
        if (!user) {
          await verifyDummyPassword(password);
          customLoginLimiter.record(clientIp);
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid email or password.',
          });
        }

        // Account found: verify real hash
        const isMatch = await verifyPassword(user.passwordHash, password);
        if (!isMatch) {
          customLoginLimiter.record(clientIp);
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid email or password.',
          });
        }

        // Successful authentication: reset failed limiter count
        customLoginLimiter.reset(clientIp);

        // Regenerate session to prevent session fixation attacks
        req.session.regenerate((regenErr) => {
          if (regenErr) {
            return next(regenErr);
          }

          req.session.userId = user.id;
          req.session.csrfToken = generateCsrfToken();

          req.session.save((saveErr) => {
            if (saveErr) {
              return next(saveErr);
            }

            return res.status(200).json({
              user: {
                id: user.id,
                email: user.email,
                createdAt: user.createdAt,
              },
              csrfToken: req.session.csrfToken,
            });
          });
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  /**
   * GET /api/auth/me
   * Returns current authenticated user profile.
   */
  router.get('/me', requireAuthMiddleware, (req, res) => {
    return res.status(200).json({
      user: req.user,
    });
  });

  /**
   * POST /api/auth/logout
   * Destroys current session and clears the session cookie.
   */
  router.post('/logout', requireCsrf, (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    };

    if (!req.session) {
      res.clearCookie('mynotes.sid', cookieOptions);
      return res.status(204).end();
    }

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({
          error: 'InternalServerError',
          message: 'Failed to terminate session cleanly.',
        });
      }

      res.clearCookie('mynotes.sid', cookieOptions);
      return res.status(204).end();
    });
  });

  return router;
}

export default createAuthRouter();
