import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import * as defaultJournalRepo from '../journal/journalRepository.js';
import { resolveWorkspaceId } from '../workspaces/workspaceResolution.js';

/**
 * Creates the journal router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultJournalRepo} [options.journalRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createJournalRouter({
  journalRepository = defaultJournalRepo,
  resolveWorkspace = resolveWorkspaceId,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to every journal endpoint
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/journal
   * Lists active, non-deleted journal entries owned by the authenticated user.
   * Query params: from, to, q, limit, offset
   */
  router.get('/', async (req, res, next) => {
    try {
      const { from, to, q, limit = '20', offset = '0' } = req.query;

      if (from !== undefined) {
        try {
          defaultJournalRepo.validateEntryDate(from, true);
        } catch (err) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Invalid "from" date: ${err.message}`,
          });
        }
      }

      if (to !== undefined) {
        try {
          defaultJournalRepo.validateEntryDate(to, true);
        } catch (err) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Invalid "to" date: ${err.message}`,
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
      if (parsedOffset < 0) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "offset" must be non-negative.',
        });
      }

      const workspaceId = await resolveWorkspace(req);

      const result = await journalRepository.findJournalEntriesByUserId({
        userId: req.user.id,
        workspaceId,
        from,
        to,
        q: typeof q === 'string' ? q : undefined,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/journal/:date
   * Retrieves the active journal entry for a specific calendar date (YYYY-MM-DD).
   */
  router.get('/:date', async (req, res, next) => {
    try {
      const { date } = req.params;
      try {
        defaultJournalRepo.validateEntryDate(date, true);
      } catch (err) {
        return res.status(400).json({
          error: 'BadRequest',
          message: err.message,
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const entry = await journalRepository.findJournalEntryByDateAndUserId({
        userId: req.user.id,
        workspaceId,
        entryDate: date,
      });

      if (!entry) {
        return res.status(404).json({
          error: 'NotFound',
          message: `No active journal entry found for date ${date}.`,
        });
      }

      return res.status(200).json(entry);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PUT /api/journal/:date
   * Creates or updates the journal entry for a specific calendar date (YYYY-MM-DD).
   * Validates date is not in the future and content does not exceed 20000 characters.
   */
  router.put('/:date', requireCsrf, async (req, res, next) => {
    try {
      const { date } = req.params;
      try {
        defaultJournalRepo.validateEntryDate(date, false);
      } catch (err) {
        return res.status(400).json({
          error: 'BadRequest',
          message: err.message,
        });
      }

      const { content } = req.body || {};
      let validContent;
      try {
        validContent = defaultJournalRepo.validateJournalContent(content);
      } catch (err) {
        return res.status(400).json({
          error: 'BadRequest',
          message: err.message,
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const result = await journalRepository.upsertJournalEntry({
        userId: req.user.id,
        workspaceId,
        entryDate: date,
        content: validContent,
      });

      return res.status(200).json({
        ...result.entry,
        entry: result.entry,
        created: result.created,
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * DELETE /api/journal/:date
   * Soft-deletes the active journal entry for a given calendar date.
   */
  router.delete('/:date', requireCsrf, async (req, res, next) => {
    try {
      const { date } = req.params;
      try {
        defaultJournalRepo.validateEntryDate(date, true);
      } catch (err) {
        return res.status(400).json({
          error: 'BadRequest',
          message: err.message,
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const deleted = await journalRepository.softDeleteJournalEntry({
        userId: req.user.id,
        workspaceId,
        entryDate: date,
      });

      if (!deleted) {
        return res.status(404).json({
          error: 'NotFound',
          message: `No active journal entry found for date ${date} to delete.`,
        });
      }

      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export default createJournalRouter();

