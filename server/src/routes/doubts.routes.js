import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import * as defaultDoubtRepo from '../doubts/doubtRepository.js';
import { resolveWorkspaceId } from '../workspaces/workspaceResolution.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Creates the doubts router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultDoubtRepo} [options.doubtRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createDoubtsRouter({
  doubtRepository = defaultDoubtRepo,
  resolveWorkspace = resolveWorkspaceId,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to every doubt endpoint
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/doubts
   * Lists active, non-deleted doubts owned by the authenticated user.
   */
  router.get('/', async (req, res, next) => {
    try {
      const { status, subject, q, limit = '20', offset = '0' } = req.query;

      if (status !== undefined) {
        if (
          typeof status !== 'string' ||
          !defaultDoubtRepo.DOUBT_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())
        ) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Query parameter "status" must be one of: ${defaultDoubtRepo.DOUBT_LIMITS.ALLOWED_STATUSES.join(', ')}.`,
          });
        }
      }

      if (typeof limit !== 'string' || !/^\d+$/.test(limit)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "limit" must be a positive integer.',
        });
      }
      const parsedLimit = parseInt(limit, 10);
      if (parsedLimit < 1 || parsedLimit > 100) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "limit" must be between 1 and 100.',
        });
      }

      if (typeof offset !== 'string' || !/^\d+$/.test(offset)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "offset" must be a non-negative integer.',
        });
      }
      const parsedOffset = parseInt(offset, 10);
      const workspaceId = await resolveWorkspace(req);

      const result = await doubtRepository.findDoubtsByUserId({
        userId: req.user.id,
        workspaceId,
        status,
        subject,
        q,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      return res.status(200).json({
        doubts: result.doubts || result.rawItems || [],
        items: result.items || result.rawItems || [],
        rawItems: result.rawItems || result.doubts || [],
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/doubts
   * Creates a new doubt.
   */
  router.post('/', requireCsrf, async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set(['question', 'details', 'subject', 'status', 'resolution', 'workspaceId']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { question, details, subject, status, resolution } = req.body;
      const workspaceId = await resolveWorkspace(req);

      if (question === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "question" is required.',
        });
      }

      try {
        const created = await doubtRepository.createDoubt({
          userId: req.user.id,
          workspaceId,
          question,
          details,
          subject,
          status,
          resolution,
        });

        return res.status(201).json(created);
      } catch (validationErr) {
        return res.status(validationErr.status || 400).json({
          error: 'BadRequest',
          message: validationErr.message,
        });
      }
    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/doubts/:id
   * Retrieves an owned, active doubt.
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid doubt ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const doubt = await doubtRepository.findDoubtByIdAndUserId({
        id,
        userId: req.user.id,
        workspaceId,
      });

      if (!doubt) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Doubt not found.',
        });
      }

      return res.status(200).json(doubt);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PATCH /api/doubts/:id
   * Updates an owned, active doubt.
   */
  router.patch('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid doubt ID format.',
        });
      }

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set(['question', 'details', 'subject', 'status', 'resolution', 'workspaceId']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { question, details, subject, status, resolution } = req.body;
      const workspaceId = await resolveWorkspace(req);

      try {
        const updated = await doubtRepository.updateDoubt({
          id,
          userId: req.user.id,
          workspaceId,
          question,
          details,
          subject,
          status,
          resolution,
        });

        if (!updated) {
          return res.status(404).json({
            error: 'NotFound',
            message: 'Doubt not found.',
          });
        }

        return res.status(200).json(updated);
      } catch (validationErr) {
        return res.status(validationErr.status || 400).json({
          error: 'BadRequest',
          message: validationErr.message,
        });
      }
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/doubts/:id/resolve
   * Resolves an owned doubt, optionally recording resolution notes.
   */
  router.post('/:id/resolve', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid doubt ID format.',
        });
      }

      let resolution = undefined;
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        if (req.body.resolution !== undefined) {
          resolution = req.body.resolution;
        }
      }

      const workspaceId = await resolveWorkspace(req);
      try {
        const updated = await doubtRepository.setDoubtStatus({
          id,
          userId: req.user.id,
          workspaceId,
          status: 'resolved',
          resolution,
        });

        if (!updated) {
          return res.status(404).json({
            error: 'NotFound',
            message: 'Doubt not found.',
          });
        }

        return res.status(200).json(updated);
      } catch (validationErr) {
        return res.status(validationErr.status || 400).json({
          error: 'BadRequest',
          message: validationErr.message,
        });
      }
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/doubts/:id/reopen
   * Reopens an owned doubt (status becomes 'open', resolved_at is cleared).
   */
  router.post('/:id/reopen', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid doubt ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const updated = await doubtRepository.setDoubtStatus({
        id,
        userId: req.user.id,
        workspaceId,
        status: 'open',
      });

      if (!updated) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Doubt not found.',
        });
      }

      return res.status(200).json(updated);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * DELETE /api/doubts/:id
   * Soft-deletes an owned doubt.
   */
  router.delete('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid doubt ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const deleted = await doubtRepository.softDeleteDoubt({
        id,
        userId: req.user.id,
        workspaceId,
      });

      if (!deleted) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Doubt not found.',
        });
      }

      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export const doubtsRoutes = createDoubtsRouter();
export default doubtsRoutes;

