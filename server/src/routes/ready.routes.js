import { Router } from 'express';
import { checkDatabaseReadiness } from '../db/pool.js';

/**
 * Creates the readiness router with optional injected readiness checker for testing.
 *
 * @param {object} [options]
 * @param {() => Promise<boolean>} [options.checkReadiness]
 * @returns {Router}
 */
export function createReadyRouter({ checkReadiness = checkDatabaseReadiness } = {}) {
  const router = Router();

  /**
   * GET /api/ready
   * Checks database connectivity and initial schema readiness.
   * Returns HTTP 200 when database is reachable and app_metadata exists.
   * Returns HTTP 503 when database is unreachable or schema is not ready.
   * Never exposes SQL, host details, credentials, or raw database errors.
   */
  router.get('/', async (req, res) => {
    try {
      const isReady = await checkReadiness();
      if (isReady) {
        return res.status(200).json({
          status: 'ready',
          database: 'connected',
        });
      }

      return res.status(503).json({
        status: 'unavailable',
        message: 'Service is not ready',
      });
    } catch {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Service is not ready',
      });
    }
  });

  return router;
}

export default createReadyRouter();
