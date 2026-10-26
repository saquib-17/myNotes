import { Router } from 'express';

const router = Router();

/**
 * GET /api/health
 * Returns process health status.
 * Note: Process health only, does not imply database or external service connectivity.
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'mynotes-api',
  });
});

export default router;
