import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import * as defaultDocumentRepo from '../documents/documentRepository.js';
import { resolveWorkspaceId } from '../workspaces/workspaceResolution.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Creates the documents router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultDocumentRepo} [options.documentRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createDocumentsRouter({
  documentRepository = defaultDocumentRepo,
  resolveWorkspace = resolveWorkspaceId,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to every documents endpoint
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/documents
   * Lists active, non-deleted documents owned by the authenticated user.
   */
  router.get('/', async (req, res, next) => {
    try {
      const { category, topic, favorite, q, limit = '20', offset = '0' } = req.query;

      if (category !== undefined) {
        if (
          typeof category !== 'string' ||
          !defaultDocumentRepo.DOCUMENT_LIMITS.ALLOWED_CATEGORIES.includes(category.toLowerCase())
        ) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Query parameter "category" must be one of: ${defaultDocumentRepo.DOCUMENT_LIMITS.ALLOWED_CATEGORIES.join(', ')}.`,
          });
        }
      }

      if (favorite !== undefined) {
        if (favorite !== 'true' && favorite !== 'false') {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Query parameter "favorite" must be "true" or "false".',
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

      const result = await documentRepository.findDocumentsByUserId({
        userId: req.user.id,
        workspaceId,
        category,
        topic,
        favorite,
        q,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      return res.status(200).json({
        documents: result.documents || result.rawItems || [],
        items: result.items || result.rawItems || [],
        rawItems: result.rawItems || result.documents || [],
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
   * POST /api/documents
   * Creates a new document owned by the authenticated user.
   */
  router.post('/', requireCsrf, async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set([
        'title',
        'url',
        'description',
        'category',
        'topic',
        'favorite',
        'workspaceId',
      ]);

      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { title, url, description, category, topic, favorite } = req.body;
      const workspaceId = await resolveWorkspace(req);

      if (title === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "title" is required.',
        });
      }

      if (url === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "url" is required.',
        });
      }

      try {
        const created = await documentRepository.createDocument({
          userId: req.user.id,
          workspaceId,
          title,
          url,
          description,
          category,
          topic,
          favorite,
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
   * GET /api/documents/:id
   * Retrieves an owned, active document.
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid document ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const document = await documentRepository.findDocumentByIdAndUserId({
        id,
        userId: req.user.id,
        workspaceId,
      });

      if (!document) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Document not found.',
        });
      }

      return res.status(200).json(document);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PATCH /api/documents/:id
   * Updates an owned, active document.
   */
  router.patch('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid document ID format.',
        });
      }

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set([
        'title',
        'url',
        'description',
        'category',
        'topic',
        'favorite',
        'workspaceId',
      ]);

      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { title, url, description, category, topic, favorite } = req.body;
      const workspaceId = await resolveWorkspace(req);

      try {
        const updated = await documentRepository.updateDocument({
          id,
          userId: req.user.id,
          workspaceId,
          title,
          url,
          description,
          category,
          topic,
          favorite,
        });

        if (!updated) {
          return res.status(404).json({
            error: 'NotFound',
            message: 'Document not found.',
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
   * POST /api/documents/:id/favorite
   * Marks an owned document as favorite.
   */
  router.post('/:id/favorite', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid document ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const updated = await documentRepository.setDocumentFavorite({
        id,
        userId: req.user.id,
        workspaceId,
        favorite: true,
      });

      if (!updated) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Document not found.',
        });
      }

      return res.status(200).json(updated);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/documents/:id/unfavorite
   * Unmarks an owned document as favorite.
   */
  router.post('/:id/unfavorite', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid document ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const updated = await documentRepository.setDocumentFavorite({
        id,
        userId: req.user.id,
        workspaceId,
        favorite: false,
      });

      if (!updated) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Document not found.',
        });
      }

      return res.status(200).json(updated);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * DELETE /api/documents/:id
   * Soft-deletes an owned document.
   */
  router.delete('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid document ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const deleted = await documentRepository.softDeleteDocument({
        id,
        userId: req.user.id,
        workspaceId,
      });

      if (!deleted) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Document not found.',
        });
      }

      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export const documentsRoutes = createDocumentsRouter();
export default documentsRoutes;

