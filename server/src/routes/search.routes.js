import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { setNoCacheHeaders } from '../auth/csrf.js';
import * as defaultSearchRepo from '../search/searchRepository.js';
import { resolveWorkspaceId } from '../workspaces/workspaceResolution.js';

/**
 * Creates the search router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultSearchRepo} [options.searchRepository]
 * @param {Function} [options.resolveWorkspace]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createSearchRouter({
  searchRepository = defaultSearchRepo,
  resolveWorkspace = resolveWorkspaceId,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to all search endpoints
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/search
   * Performs workspace-scoped global search across notes, tasks, questions, documents, revision items, and doubts.
   */
  router.get('/', async (req, res, next) => {
    try {
      const { q, type, limit, offset } = req.query;

      // 1. Validate query "q"
      if (q === undefined || typeof q !== 'string' || !q.trim()) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Search query "q" is required and cannot be empty.',
        });
      }

      const trimmedQ = q.trim();
      if (trimmedQ.length > 200) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Search query cannot exceed 200 characters.',
        });
      }

      // 2. Validate "type" filter
      const typeFilter = type ? type.trim().toLowerCase() : 'all';
      if (!defaultSearchRepo.ALLOWED_SEARCH_TYPES.includes(typeFilter)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: `Invalid type filter. Allowed values: ${defaultSearchRepo.ALLOWED_SEARCH_TYPES.join(', ')}.`,
        });
      }

      // 3. Validate "limit"
      let parsedLimit = 20;
      if (limit !== undefined) {
        if (typeof limit !== 'string' || !/^\d+$/.test(limit.trim())) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Limit must be an integer between 1 and 50.',
          });
        }
        parsedLimit = parseInt(limit.trim(), 10);
        if (parsedLimit < 1 || parsedLimit > 50) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Limit must be an integer between 1 and 50.',
          });
        }
      }

      // 4. Validate "offset"
      let parsedOffset = 0;
      if (offset !== undefined) {
        if (typeof offset !== 'string' || !/^\d+$/.test(offset.trim())) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Offset must be a non-negative integer.',
          });
        }
        parsedOffset = parseInt(offset.trim(), 10);
        if (parsedOffset < 0) {
          return res.status(400).json({
            error: 'BadRequest',
            message: 'Offset must be a non-negative integer.',
          });
        }
      }

      // 5. Resolve workspace
      const workspaceId = await resolveWorkspace(req);
      const userId = req.user?.id || req.session?.userId;
      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required.',
        });
      }

      // 6. Perform search
      const result = await searchRepository.performGlobalSearch({
        userId,
        workspaceId,
        q: trimmedQ,
        type: typeFilter,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      return res.status(200).json(result);
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({
          error: 'BadRequest',
          message: err.message,
        });
      }
      if (err.status === 401) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: err.message,
        });
      }
      if (err.status === 404) {
        return res.status(404).json({
          error: 'NotFound',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  return router;
}

export default createSearchRouter();

