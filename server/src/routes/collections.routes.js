import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import { generatePreview } from '../notes/contentValidator.js';
import * as defaultCollectionRepo from '../collections/collectionRepository.js';
import * as defaultNoteRepo from '../notes/noteRepository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Creates the collections router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultCollectionRepo} [options.collectionRepository]
 * @param {typeof defaultNoteRepo} [options.noteRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createCollectionsRouter({
  collectionRepository = defaultCollectionRepo,
  noteRepository = defaultNoteRepo,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to every collections endpoint
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/collections
   * Lists all active collections owned by the authenticated user with note count.
   */
  router.get('/', async (req, res, next) => {
    try {
      const collections = await collectionRepository.findCollectionsByUserId({
        userId: req.user.id,
      });

      return res.status(200).json({
        collections,
        items: collections,
        total: collections.length,
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/collections
   * Creates a new collection for the authenticated user.
   */
  router.post('/', requireCsrf, async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set(['name']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { name } = req.body;
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "name" must be a non-empty string.',
        });
      }

      if (name.trim().length > 80) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "name" cannot exceed 80 characters.',
        });
      }

      const result = await collectionRepository.createCollection({
        userId: req.user.id,
        name,
      });

      if (result.conflict) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'A collection with this name already exists.',
        });
      }

      return res.status(201).json(result.collection);
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({ error: 'BadRequest', message: err.message });
      }
      return next(err);
    }
  });

  /**
   * PATCH /api/collections/:id
   * Renames an existing active collection.
   */
  router.patch('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid collection ID format.',
        });
      }

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set(['name']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { name } = req.body;
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "name" must be a non-empty string.',
        });
      }

      if (name.trim().length > 80) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "name" cannot exceed 80 characters.',
        });
      }

      const result = await collectionRepository.updateCollection({
        id,
        userId: req.user.id,
        name,
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Collection not found.',
        });
      }

      if (result.conflict) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'A collection with this name already exists.',
        });
      }

      return res.status(200).json(result.collection);
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({ error: 'BadRequest', message: err.message });
      }
      return next(err);
    }
  });

  /**
   * DELETE /api/collections/:id
   * Soft-deletes a collection and clears collection_id on all its notes.
   */
  router.delete('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid collection ID format.',
        });
      }

      const result = await collectionRepository.softDeleteCollection({
        id,
        userId: req.user.id,
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Collection not found.',
        });
      }

      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/collections/:id/notes
   * Retrieves active, non-trashed notes belonging to the specified collection.
   */
  router.get('/:id/notes', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid collection ID format.',
        });
      }

      // Verify collection exists and is active for this user
      const collection = await collectionRepository.findCollectionByIdAndUserId({
        id,
        userId: req.user.id,
      });

      if (!collection) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Collection not found.',
        });
      }

      const { q, limit = '20', offset = '0' } = req.query;

      if (q !== undefined && (typeof q !== 'string' || q.length > 200)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Search query must be a string up to 200 characters.',
        });
      }

      if (typeof limit !== 'string' || !/^\d+$/.test(limit)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "limit" must be a positive integer between 1 and 100.',
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

      const result = await noteRepository.findNotesByUserId({
        userId: req.user.id,
        collectionId: id,
        q,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      const items = result.rawItems.map((row) => ({
        id: row.id,
        title: row.title,
        preview: generatePreview(row.content_text),
        pinned: Boolean(row.pinned),
        collectionId: row.collectionId || null,
        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      const total = typeof result.total === 'number'
        ? result.total
        : (result.offset + items.length + (result.hasMore ? 1 : 0));

      return res.status(200).json({
        notes: items,
        items,
        total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
        collection,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export const collectionsRoutes = createCollectionsRouter();
export default collectionsRoutes;

