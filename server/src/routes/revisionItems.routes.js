import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import * as defaultRevisionRepo from '../revision/revisionItemRepository.js';
import { resolveWorkspaceId } from '../workspaces/workspaceResolution.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Creates the revision items router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultRevisionRepo} [options.revisionItemRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createRevisionItemsRouter({
  revisionItemRepository = defaultRevisionRepo,
  resolveWorkspace = resolveWorkspaceId,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to every revision item endpoint
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/revision-items
   * Lists active, non-deleted revision items owned by the authenticated user.
   */
  router.get('/', async (req, res, next) => {
    try {
      const { status, subject, q, limit = '20', offset = '0' } = req.query;

      if (status !== undefined) {
        if (
          typeof status !== 'string' ||
          !defaultRevisionRepo.REVISION_ITEM_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())
        ) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Query parameter "status" must be one of: ${defaultRevisionRepo.REVISION_ITEM_LIMITS.ALLOWED_STATUSES.join(', ')}.`,
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

      const result = await revisionItemRepository.findRevisionItemsByUserId({
        userId: req.user.id,
        workspaceId,
        status,
        subject,
        q,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      return res.status(200).json({
        revisionItems: result.revisionItems || result.rawItems || [],
        items: result.items || result.rawItems || [],
        rawItems: result.rawItems || result.revisionItems || [],
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
   * POST /api/revision-items
   * Creates a new revision item.
   */
  router.post('/', requireCsrf, async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set(['title', 'details', 'subject', 'status', 'workspaceId']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { title, details, subject, status } = req.body;
      const workspaceId = await resolveWorkspace(req);

      if (title === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "title" is required.',
        });
      }

      try {
        const created = await revisionItemRepository.createRevisionItem({
          userId: req.user.id,
          workspaceId,
          title,
          details,
          subject,
          status,
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
   * GET /api/revision-items/:id
   * Retrieves an owned, active revision item.
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid revision item ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const item = await revisionItemRepository.findRevisionItemByIdAndUserId({
        id,
        userId: req.user.id,
        workspaceId,
      });

      if (!item) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Revision item not found.',
        });
      }

      return res.status(200).json(item);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PATCH /api/revision-items/:id
   * Updates an owned, active revision item.
   */
  router.patch('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid revision item ID format.',
        });
      }

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set(['title', 'details', 'subject', 'status', 'workspaceId']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { title, details, subject, status } = req.body;
      const workspaceId = await resolveWorkspace(req);

      try {
        const updated = await revisionItemRepository.updateRevisionItem({
          id,
          userId: req.user.id,
          workspaceId,
          title,
          details,
          subject,
          status,
        });

        if (!updated) {
          return res.status(404).json({
            error: 'NotFound',
            message: 'Revision item not found.',
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
   * POST /api/revision-items/:id/revise
   * Marks an owned revision item as revised.
   */
  router.post('/:id/revise', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid revision item ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const updated = await revisionItemRepository.setRevisionItemStatus({
        id,
        userId: req.user.id,
        workspaceId,
        status: 'revised',
      });

      if (!updated) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Revision item not found.',
        });
      }

      return res.status(200).json(updated);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/revision-items/:id/reopen
   * Reopens an owned revision item (sets status to pending).
   */
  router.post('/:id/reopen', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid revision item ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const updated = await revisionItemRepository.setRevisionItemStatus({
        id,
        userId: req.user.id,
        workspaceId,
        status: 'pending',
      });

      if (!updated) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Revision item not found.',
        });
      }

      return res.status(200).json(updated);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * DELETE /api/revision-items/:id
   * Soft-deletes an owned revision item.
   */
  router.delete('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid revision item ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const deleted = await revisionItemRepository.softDeleteRevisionItem({
        id,
        userId: req.user.id,
        workspaceId,
      });

      if (!deleted) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Revision item not found.',
        });
      }

      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export const revisionItemsRoutes = createRevisionItemsRouter();
export default revisionItemsRoutes;

