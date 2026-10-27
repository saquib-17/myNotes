import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import { generatePreview } from '../notes/contentValidator.js';
import * as defaultTagRepo from '../tags/tagRepository.js';
import * as defaultNoteRepo from '../notes/noteRepository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Creates the tags router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultTagRepo} [options.tagRepository]
 * @param {typeof defaultNoteRepo} [options.noteRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createTagsRouter({
  tagRepository = defaultTagRepo,
  noteRepository = defaultNoteRepo,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to every tags endpoint
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/tags
   * Lists all active tags owned by the authenticated user with note count.
   */
  router.get('/', async (req, res, next) => {
    try {
      const tags = await tagRepository.findTagsByUserId({
        userId: req.user.id,
      });

      return res.status(200).json({
        tags,
        items: tags,
        total: tags.length,
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/tags
   * Creates a new tag for the authenticated user.
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

      const normalized = name.trim().replace(/\s+/g, ' ');
      if (normalized.length > defaultTagRepo.TAG_LIMITS.MAX_NAME_LENGTH) {
        return res.status(400).json({
          error: 'BadRequest',
          message: `Field "name" cannot exceed ${defaultTagRepo.TAG_LIMITS.MAX_NAME_LENGTH} characters.`,
        });
      }

      const result = await tagRepository.createTag({
        userId: req.user.id,
        name: normalized,
      });

      if (result.conflict) {
        return res.status(409).json({
          error: 'Conflict',
          code: 'TAG_CONFLICT',
          message: 'A tag with this name already exists.',
        });
      }

      return res.status(201).json(result.tag);
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({ error: 'BadRequest', message: err.message });
      }
      return next(err);
    }
  });

  /**
   * PATCH /api/tags/:id
   * Renames an existing active tag owned by the authenticated user.
   */
  router.patch('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid tag ID format.',
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

      const normalized = name.trim().replace(/\s+/g, ' ');
      if (normalized.length > defaultTagRepo.TAG_LIMITS.MAX_NAME_LENGTH) {
        return res.status(400).json({
          error: 'BadRequest',
          message: `Field "name" cannot exceed ${defaultTagRepo.TAG_LIMITS.MAX_NAME_LENGTH} characters.`,
        });
      }

      const result = await tagRepository.updateTag({
        id,
        userId: req.user.id,
        name: normalized,
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Tag not found.',
        });
      }

      if (result.conflict) {
        return res.status(409).json({
          error: 'Conflict',
          code: 'TAG_CONFLICT',
          message: 'A tag with this name already exists.',
        });
      }

      return res.status(200).json(result.tag);
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({ error: 'BadRequest', message: err.message });
      }
      return next(err);
    }
  });

  /**
   * DELETE /api/tags/:id
   * Soft-deletes a tag and removes note_tags associations.
   */
  router.delete('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid tag ID format.',
        });
      }

      const result = await tagRepository.deleteTag({
        id,
        userId: req.user.id,
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Tag not found.',
        });
      }

      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/tags/:id/notes
   * Retrieves active, non-trashed notes belonging to the specified tag.
   */
  router.get('/:id/notes', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid tag ID format.',
        });
      }

      // Verify tag exists and is active for this user
      const tag = await tagRepository.findTagByIdAndUserId({
        id,
        userId: req.user.id,
      });

      if (!tag) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Tag not found.',
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
        tagId: id,
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
        tags: row.tags || [],
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
        tag,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export const tagsRoutes = createTagsRouter();
export default tagsRoutes;

