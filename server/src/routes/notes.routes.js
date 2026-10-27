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
import * as defaultCollectionRepo from '../collections/collectionRepository.js';
import * as defaultTagRepo from '../tags/tagRepository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates the notes router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultNoteRepo} [options.noteRepository]
 * @param {typeof defaultCollectionRepo} [options.collectionRepository]
 * @param {typeof defaultTagRepo} [options.tagRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createNotesRouter({
  noteRepository = defaultNoteRepo,
  collectionRepository = defaultCollectionRepo,
  tagRepository = defaultTagRepo,
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
      const allowedKeys = new Set(['title', 'content', 'pinned', 'collectionId', 'tags']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { title, content, pinned, collectionId, tags } = req.body;

      if (pinned !== undefined && typeof pinned !== 'boolean') {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "pinned" must be a boolean.',
        });
      }

      let normalizedTags;
      if (tags !== undefined) {
        try {
          normalizedTags = tagRepository.validateAndNormalizeNoteTags(tags);
        } catch (tagErr) {
          return res.status(tagErr.status || 400).json({
            error: 'BadRequest',
            message: tagErr.message,
          });
        }
      }

      if (collectionId !== undefined && collectionId !== null) {
        if (!isValidUuid(collectionId)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Invalid collection ID format.',
          });
        }
        const collection = await collectionRepository.findCollectionByIdAndUserId({
          id: collectionId,
          userId: req.user.id,
        });
        if (!collection) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Collection not found or unavailable.',
          });
        }
      }

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
        pinned: Boolean(pinned),
        collectionId: collectionId || null,
        tags: normalizedTags,
      });

      return res.status(201).json({
        ...createdNote,
        collectionId: createdNote.collectionId || null,
        tags: createdNote.tags || [],
      });
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
      let { q = '', limit = '20', offset = '0', collectionId, tagId, tag } = req.query;

      if (collectionId !== undefined && collectionId !== null && collectionId.trim() !== '') {
        if (!isValidUuid(collectionId.trim())) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Query parameter "collectionId" must be a valid UUID.',
          });
        }
      }

      if (tagId !== undefined && tagId !== null && tagId.trim() !== '') {
        if (!isValidUuid(tagId.trim())) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Query parameter "tagId" must be a valid UUID.',
          });
        }
      }

      if (tag !== undefined && tag !== null && typeof tag === 'string' && tag.length > 200) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "tag" cannot exceed 200 characters.',
        });
      }

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
        collectionId: collectionId ? collectionId.trim() : undefined,
        tagId: tagId ? tagId.trim() : undefined,
        tag: tag ? tag.trim() : undefined,
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
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/notes/trash
   * Retrieves paginated soft-deleted notes owned by the authenticated user.
   */
  router.get('/trash', async (req, res, next) => {
    try {
      const { limit = '20', offset = '0' } = req.query;

      // Validate limit: integer between 1 and 100
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

      // Validate offset: non-negative integer
      if (typeof offset !== 'string' || !/^\d+$/.test(offset)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "offset" must be a non-negative integer.',
        });
      }
      const parsedOffset = parseInt(offset, 10);

      const result = await noteRepository.findTrashedNotesByUserId({
        userId: req.user.id,
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
        deletedAt: row.deletedAt,
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

      return res.status(200).json({
        ...note,
        collectionId: note.collectionId || null,
        tags: note.tags || [],
      });
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
      const allowedKeys = new Set(['title', 'content', 'expectedVersion', 'pinned', 'collectionId', 'tags']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { title, content, expectedVersion, pinned, collectionId, tags } = req.body;

      if (pinned !== undefined && typeof pinned !== 'boolean') {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "pinned" must be a boolean.',
        });
      }

      let normalizedTags;
      if (tags !== undefined) {
        try {
          normalizedTags = tagRepository.validateAndNormalizeNoteTags(tags);
        } catch (tagErr) {
          return res.status(tagErr.status || 400).json({
            error: 'BadRequest',
            message: tagErr.message,
          });
        }
      }

      if (collectionId !== undefined && collectionId !== null) {
        if (!isValidUuid(collectionId)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Invalid collection ID format.',
          });
        }
        const collection = await collectionRepository.findCollectionByIdAndUserId({
          id: collectionId,
          userId: req.user.id,
        });
        if (!collection) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Collection not found or unavailable.',
          });
        }
      }

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
        pinned,
        collectionId,
        tags: normalizedTags,
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

      return res.status(200).json({
        ...updateResult.updatedNote,
        collectionId: updateResult.updatedNote.collectionId || null,
        tags: updateResult.updatedNote.tags || [],
      });
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
   * POST /api/notes/:id/pin
   * Sets pinned = true for an active note owned by the authenticated user.
   */
  router.post('/:id/pin', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid note ID format.',
        });
      }

      const result = await noteRepository.setNotePinned({
        id,
        userId: req.user.id,
        pinned: true,
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Note not found.',
        });
      }

      return res.status(200).json(result.updatedNote);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/notes/:id/unpin
   * Sets pinned = false for an active note owned by the authenticated user.
   */
  router.post('/:id/unpin', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid note ID format.',
        });
      }

      const result = await noteRepository.setNotePinned({
        id,
        userId: req.user.id,
        pinned: false,
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Note not found.',
        });
      }

      return res.status(200).json(result.updatedNote);
    } catch (err) {
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

  /**
   * POST /api/notes/:id/restore
   * Restores a soft-deleted note by setting deleted_at = NULL.
   * Only the owner can restore, and only soft-deleted notes can be restored.
   */
  router.post('/:id/restore', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid note ID format.',
        });
      }

      const result = await noteRepository.restoreNote({
        id,
        userId: req.user.id,
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Note not found or not in trash.',
        });
      }

      return res.status(200).json(result.restoredNote);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export const notesRoutes = createNotesRouter();
export default notesRoutes;
