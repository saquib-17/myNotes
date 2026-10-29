import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { setNoCacheHeaders } from '../auth/csrf.js';
import * as defaultDashboardRepo from '../dashboard/dashboardRepository.js';
import { resolveWorkspaceId } from '../workspaces/workspaceResolution.js';

/**
 * Creates the dashboard router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultDashboardRepo} [options.dashboardRepository]
 * @param {Function} [options.resolveWorkspace]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createDashboardRouter({
  dashboardRepository = defaultDashboardRepo,
  resolveWorkspace = resolveWorkspaceId,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/dashboard
   * Retrieves summary statistics, today's tasks/journal, focus items, and recent activity.
   */
  router.get('/', async (req, res, next) => {
    try {
      const { date } = req.query;
      const workspaceId = await resolveWorkspace(req);

      const overview = await dashboardRepository.getDashboardOverview({
        userId: req.user.id,
        workspaceId,
        clientDate: typeof date === 'string' ? date : undefined,
      });

      const email = req.user.email || '';
      const emailName = email.includes('@') ? email.split('@')[0] : email;

      return res.status(200).json({
        user: {
          id: req.user.id,
          email,
          name: req.user.name || emailName || 'User',
        },
        ...overview,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export default createDashboardRouter();
