import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf as defaultRequireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import * as defaultUserRepo from '../auth/userRepository.js';
import * as defaultProfileRepo from '../profile/profileRepository.js';
import {
  validatePassword as defaultValidatePassword,
  hashPassword as defaultHashPassword,
  verifyPassword as defaultVerifyPassword,
} from '../auth/password.js';

const WEAK_PASSWORDS = new Set([
  'password',
  '12345678',
  'qwerty123',
  '123456789012345',
  'password1234567',
  'admin1234567890',
]);

/**
 * Creates the profile router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultUserRepo} [options.userRepository]
 * @param {typeof defaultProfileRepo} [options.profileRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @param {import('express').RequestHandler} [options.requireCsrfMiddleware]
 * @param {typeof defaultValidatePassword} [options.validatePasswordFn]
 * @param {typeof defaultHashPassword} [options.hashPasswordFn]
 * @param {typeof defaultVerifyPassword} [options.verifyPasswordFn]
 * @returns {Router}
 */
export function createProfileRouter({
  userRepository = defaultUserRepo,
  profileRepository = defaultProfileRepo,
  requireAuthMiddleware = defaultRequireAuth,
  requireCsrfMiddleware = defaultRequireCsrf,
  validatePasswordFn = defaultValidatePassword,
  hashPasswordFn = defaultHashPassword,
  verifyPasswordFn = defaultVerifyPassword,
} = {}) {
  const router = Router();

  // Strict Cache-Control: no-store and authentication required for all profile operations
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/profile
   * Returns current user's safe profile.
   */
  router.get('/', async (req, res, next) => {
    try {
      const user = await userRepository.findUserById(req.user.id);
      if (!user) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'User profile not found.',
        });
      }

      const safeProfile = {
        id: user.id,
        email: user.email,
        name: user.displayName || user.name || null,
        displayName: user.displayName || user.name || null,
        createdAt: user.createdAt,
      };

      return res.status(200).json({
        ...safeProfile,
        user: safeProfile,
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PATCH /api/profile
   * Allows updating only the display name.
   */
  router.patch('/', requireCsrfMiddleware, async (req, res, next) => {
    try {
      // Disallow email changes
      if (req.body?.email !== undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Email address cannot be changed in this version.',
        });
      }

      const rawName =
        req.body?.name !== undefined ? req.body.name : req.body?.displayName;

      let normalizedName = null;
      if (rawName !== undefined && rawName !== null) {
        if (typeof rawName !== 'string') {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Display name must be a string.',
          });
        }
        const trimmed = rawName.trim();
        if (trimmed.length < 1 || trimmed.length > 60) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Display name must be between 1 and 60 characters.',
          });
        }
        normalizedName = trimmed;
      }

      const updated = await userRepository.updateUserDisplayName(
        req.user.id,
        normalizedName
      );

      if (!updated) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'User profile not found.',
        });
      }

      const safeProfile = {
        id: updated.id,
        email: updated.email,
        name: updated.displayName || null,
        displayName: updated.displayName || null,
        createdAt: updated.createdAt,
      };

      return res.status(200).json({
        ...safeProfile,
        user: safeProfile,
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/profile/change-password
   * Changes the user's password, invalidates other sessions, and keeps the current session active.
   */
  router.post(
    '/change-password',
    requireCsrfMiddleware,
    async (req, res, next) => {
      try {
        const { currentPassword, newPassword, confirmPassword } =
          req.body || {};

        if (!currentPassword || typeof currentPassword !== 'string') {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Current password is required.',
          });
        }

        if (!newPassword || typeof newPassword !== 'string') {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'New password is required.',
          });
        }

        if (!confirmPassword || typeof confirmPassword !== 'string') {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Password confirmation is required.',
          });
        }

        if (newPassword !== confirmPassword) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'New password and confirmation do not match.',
          });
        }

        if (currentPassword === newPassword) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'New password cannot be the same as your current password.',
          });
        }

        // Validate new password policy
        const policyCheck = validatePasswordFn(newPassword);
        if (!policyCheck.valid) {
          return res.status(400).json({
            error: 'BadRequest',
            message: policyCheck.error,
          });
        }

        if (WEAK_PASSWORDS.has(newPassword.toLowerCase())) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'New password is too common or weak.',
          });
        }

        // Fetch user with existing password hash
        const user = await userRepository.findUserWithPasswordById(req.user.id);
        if (!user || !user.passwordHash) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication record not found.',
          });
        }

        // Verify current password with constant-time Argon2id check
        const isCurrentValid = await verifyPasswordFn(
          user.passwordHash,
          currentPassword
        );
        if (!isCurrentValid) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Current password is incorrect.',
          });
        }

        // Check if new password matches existing hash
        const isSameAsExisting = await verifyPasswordFn(
          user.passwordHash,
          newPassword
        );
        if (isSameAsExisting) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'New password cannot be the same as your current password.',
          });
        }

        // Hash new password using OWASP Argon2id settings
        const newHash = await hashPasswordFn(newPassword);
        await userRepository.updateUserPassword(req.user.id, newHash);

        // Invalidate all other sessions except current
        await profileRepository.invalidateOtherSessions({
          userId: req.user.id,
          currentSessionId: req.sessionID,
        });

        return res.status(200).json({
          success: true,
          message:
            'Password changed successfully. All other sessions have been signed out.',
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  /**
   * GET /api/profile/sessions
   * Returns active sessions for the current user with safe metadata only.
   */
  router.get('/sessions', async (req, res, next) => {
    try {
      const sessions = await profileRepository.getUserSessions({
        userId: req.user.id,
        currentSessionId: req.sessionID,
      });

      return res.status(200).json({
        sessions,
        total: sessions.length,
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/profile/sessions/logout-current
   * Signs out the current session and clears the session cookie.
   */
  router.post(
    '/sessions/logout-current',
    requireCsrfMiddleware,
    (req, res) => {
      const isProduction = process.env.NODE_ENV === 'production';
      const cookieOptions = {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
      };

      if (!req.session) {
        res.clearCookie('mynotes.sid', cookieOptions);
        return res.status(200).json({
          success: true,
          message: 'Current session signed out.',
        });
      }

      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({
            error: 'InternalServerError',
            message: 'Failed to terminate session cleanly.',
          });
        }

        res.clearCookie('mynotes.sid', cookieOptions);
        return res.status(200).json({
          success: true,
          message: 'Current session signed out.',
        });
      });
    }
  );

  /**
   * POST /api/profile/sessions/logout-others
   * Invalidates all active sessions for the user except the current session.
   */
  router.post(
    '/sessions/logout-others',
    requireCsrfMiddleware,
    async (req, res, next) => {
      try {
        const count = await profileRepository.invalidateOtherSessions({
          userId: req.user.id,
          currentSessionId: req.sessionID,
        });

        return res.status(200).json({
          success: true,
          count,
          message: 'All other sessions have been signed out.',
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  return router;
}

export default createProfileRouter();

