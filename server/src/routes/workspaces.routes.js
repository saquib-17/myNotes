import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import {
  createWorkspace,
  findWorkspacesByUserId,
  findWorkspaceByIdAndUserId,
  updateWorkspace,
  softDeleteWorkspace,
  setDefaultWorkspace,
  DuplicateWorkspaceNameError,
} from '../workspaces/workspaceRepository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

export function createWorkspacesRouter({
  workspaceRepository = {
    createWorkspace,
    findWorkspacesByUserId,
    findWorkspaceByIdAndUserId,
    updateWorkspace,
    softDeleteWorkspace,
    setDefaultWorkspace,
  },
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to every workspaces endpoint
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  // 1. GET /api/workspaces
  router.get('/', async (req, res, next) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required.',
        });
      }
      const workspaces = await workspaceRepository.findWorkspacesByUserId(userId);
      return res.status(200).json({ workspaces });
    } catch (err) {
      return next(err);
    }
  });

  // 2. POST /api/workspaces
  router.post('/', requireCsrf, async (req, res, next) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required.',
        });
      }
      const { name, isDefault } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Workspace name is required and cannot be empty.',
        });
      }

      if (name.trim().length > 60) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Workspace name cannot exceed 60 characters.',
        });
      }

      const workspace = await workspaceRepository.createWorkspace({
        userId,
        name: name.trim(),
        isDefault: Boolean(isDefault),
      });

      return res.status(201).json({ workspace });
    } catch (err) {
      if (err instanceof DuplicateWorkspaceNameError || err.status === 409) {
        return res.status(409).json({
          error: 'Conflict',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  // 3. PATCH /api/workspaces/:id
  router.patch('/:id', requireCsrf, async (req, res, next) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required.',
        });
      }
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Workspace not found.',
        });
      }
      const { name } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Workspace name is required and cannot be empty.',
        });
      }

      if (name.trim().length > 60) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Workspace name cannot exceed 60 characters.',
        });
      }

      const workspace = await workspaceRepository.updateWorkspace({
        id,
        userId,
        name: name.trim(),
      });

      return res.status(200).json({ workspace });
    } catch (err) {
      if (err.status === 404) {
        return res.status(404).json({
          error: 'NotFound',
          message: err.message || 'Workspace not found.',
        });
      }
      if (err instanceof DuplicateWorkspaceNameError || err.status === 409) {
        return res.status(409).json({
          error: 'Conflict',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  // 4. DELETE /api/workspaces/:id
  router.delete('/:id', requireCsrf, async (req, res, next) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required.',
        });
      }
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Workspace not found.',
        });
      }

      await workspaceRepository.softDeleteWorkspace({
        id,
        userId,
      });

      return res.status(204).send();
    } catch (err) {
      if (err.status === 404) {
        return res.status(404).json({
          error: 'NotFound',
          message: err.message || 'Workspace not found.',
        });
      }
      if (err.status === 400) {
        return res.status(400).json({
          error: 'BadRequest',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  // 5. POST /api/workspaces/:id/set-default
  router.post('/:id/set-default', requireCsrf, async (req, res, next) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required.',
        });
      }
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Workspace not found.',
        });
      }

      const workspace = await workspaceRepository.setDefaultWorkspace({
        id,
        userId,
      });

      const workspaces = await workspaceRepository.findWorkspacesByUserId(userId);

      return res.status(200).json({ workspace, workspaces });
    } catch (err) {
      if (err.status === 404) {
        return res.status(404).json({
          error: 'NotFound',
          message: err.message || 'Workspace not found.',
        });
      }
      return next(err);
    }
  });

  return router;
}

export default createWorkspacesRouter();

