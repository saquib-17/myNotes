import { findUserById } from './userRepository.js';

/**
 * Creates requireAuth middleware with optional injected user repository for testing.
 *
 * @param {object} [options]
 * @param {(id: string) => Promise<any>} [options.getUserById]
 * @returns {import('express').RequestHandler}
 */
export function createRequireAuth({ getUserById = findUserById } = {}) {
  return async function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required.',
      });
    }

    try {
      const user = await getUserById(req.session.userId);
      if (!user) {
        // User record no longer exists; destroy invalid session
        req.session.destroy(() => {});
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required.',
        });
      }

      // Attach strictly validated public user object; ignore headers, body, or params
      req.user = {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      };

      return next();
    } catch {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required.',
      });
    }
  };
}

export const requireAuth = createRequireAuth();
