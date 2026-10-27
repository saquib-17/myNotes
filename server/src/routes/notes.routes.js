import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import {
  validateAndNormalizeTitle,
  validateContent,
  derivePlainText,
  generatePreview,
  ValidationError,
} from '../notes/contentValidator.js';
import * as defaultNoteRepo from '../notes/noteRepository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates the notes router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultNoteRepo} [options.noteRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createNotesRouter({
  noteRepository = defaultNoteRepo,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to every notes endpoint
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * Helper to validate that a path parameter is a valid UUID.
   */
  function isValidUuid(id) {
    return typeof id === 'string' && UUID_REGEX.test(id);
  }

  /**
   * POST /api/notes
   * Creates a new private note for the authenticated user.
   */
  router.post('/', requireCsrf, async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      // Strict property whitelist: reject unknown fields (e.g. user_id, version)
      const allowedKeys = new Set(['title', 'content']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { title, content } = req.body;

      if (title === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "title" is required.',
        });
      }

      if (content === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "content" is required.',
        });
      }

      const normalizedTitle = validateAndNormalizeTitle(title);
      validateContent(content);
      const contentText = derivePlainText(content);

      const createdNote = await noteRepository.createNote({
        userId: req.user.id,
        title: normalizedTitle,
        contentJson: content,
        contentText,
      });

      return res.status(201).json(createdNote);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(err.status || 400).json({
          error: 'BadRequest',
          message: err.message,
          code: err.code,
        });
      }
      return next(err);
    }
  });

  /**
   * GET /api/notes
   * Lists active notes owned by the authenticated user with optional search and pagination.
   */
  router.get('/', async (req, res, next) => {
    try {
      let { q = '', limit = '20', offset = '0' } = req.query;

      // Validate search string
      if (typeof q !== 'string') {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Search query "q" must be a string.',
        });
      }
      if (q.length > 200) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Search query "q" cannot exceed 200 characters.',
        });
      }

      // Validate limit: positive integer between 1 and 100
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

      // Validate offset: non-negative integer
      if (typeof offset !== 'string' || !/^\d+$/.test(offset)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "offset" must be a non-negative integer.',
        });
      }
      const parsedOffset = parseInt(offset, 10);

      const result = await noteRepository.findNotesByUserId({
        userId: req.user.id,
        q,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      const items = result.rawItems.map((row) => ({
        id: row.id,
        title: row.title,
        preview: generatePreview(row.content_text),
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
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/notes/:id
   * Retrieves a single active note owned by the authenticated user.
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid note ID format.',
        });
      }

      const note = await noteRepository.findNoteByIdAndUserId({
        id,
        userId: req.user.id,
      });

      if (!note) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Note not found.',
        });
      }

      return res.status(200).json(note);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PATCH /api/notes/:id
   * Conditionally updates a note using optimistic concurrency.
   */
  router.patch('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid note ID format.',
        });
      }

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      // Reject unknown fields
      const allowedKeys = new Set(['title', 'content', 'expectedVersion']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { title, content, expectedVersion } = req.body;

      if (title === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "title" is required.',
        });
      }

      if (content === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "content" is required.',
        });
      }

      if (expectedVersion === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "expectedVersion" is required.',
        });
      }

      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "expectedVersion" must be a positive integer.',
        });
      }

      const normalizedTitle = validateAndNormalizeTitle(title);
      validateContent(content);
      const contentText = derivePlainText(content);

      const updateResult = await noteRepository.updateNote({
        id,
        userId: req.user.id,
        expectedVersion,
        title: normalizedTitle,
        contentJson: content,
        contentText,
      });

      if (updateResult.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Note not found.',
        });
      }

      if (updateResult.conflict) {
        return res.status(409).json({
          error: 'Conflict',
          code: 'NOTE_VERSION_CONFLICT',
          message: 'Note version conflict. The note has been modified by another request.',
        });
      }

      return res.status(200).json(updateResult.updatedNote);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(err.status || 400).json({
          error: 'BadRequest',
          message: err.message,
          code: err.code,
        });
      }
      return next(err);
    }
  });

  /**
   * POST /api/notes/:id/trash
   * Soft-deletes a note to trash with optimistic concurrency check.
   */
  router.post('/:id/trash', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid note ID format.',
        });
      }

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      // Reject unknown fields
      const allowedKeys = new Set(['expectedVersion']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { expectedVersion } = req.body;

      if (expectedVersion === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "expectedVersion" is required.',
        });
      }

      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "expectedVersion" must be a positive integer.',
        });
      }

      const trashResult = await noteRepository.trashNote({
        id,
        userId: req.user.id,
        expectedVersion,
      });

      if (trashResult.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Note not found.',
        });
      }

      if (trashResult.conflict) {
        return res.status(409).json({
          error: 'Conflict',
          code: 'NOTE_VERSION_CONFLICT',
          message: 'Note version conflict. The note has been modified by another request.',
        });
      }

      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export const notesRoutes = createNotesRouter();
export default notesRoutes;
