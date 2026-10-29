import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import * as defaultTaskRepo from '../tasks/taskRepository.js';
import { resolveWorkspaceId } from '../workspaces/workspaceResolution.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Creates the tasks router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultTaskRepo} [options.taskRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createTasksRouter({
  taskRepository = defaultTaskRepo,
  resolveWorkspace = resolveWorkspaceId,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to every tasks endpoint
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/tasks
   * Lists active, non-deleted tasks owned by the authenticated user.
   */
  router.get('/', async (req, res, next) => {
    try {
      const { status, priority, q, limit = '20', offset = '0' } = req.query;

      if (status !== undefined) {
        if (
          typeof status !== 'string' ||
          !defaultTaskRepo.TASK_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())
        ) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Query parameter "status" must be one of: ${defaultTaskRepo.TASK_LIMITS.ALLOWED_STATUSES.join(', ')}.`,
          });
        }
      }

      if (priority !== undefined) {
        if (
          typeof priority !== 'string' ||
          !defaultTaskRepo.TASK_LIMITS.ALLOWED_PRIORITIES.includes(priority.toLowerCase())
        ) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Query parameter "priority" must be one of: ${defaultTaskRepo.TASK_LIMITS.ALLOWED_PRIORITIES.join(', ')}.`,
          });
        }
      }

      if (q !== undefined && (typeof q !== 'string' || q.length > 200)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Search query "q" must be a string up to 200 characters.',
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
      const workspaceId = await resolveWorkspace(req);

      const result = await taskRepository.findTasksByUserId({
        userId: req.user.id,
        workspaceId,
        status,
        priority,
        q,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      return res.status(200).json({
        tasks: result.tasks || result.rawItems || [],
        items: result.items || result.rawItems || [],
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/tasks
   * Creates a new task for the authenticated user.
   */
  router.post('/', requireCsrf, async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set(['title', 'details', 'status', 'priority', 'dueDate', 'workspaceId']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { title, details, status, priority, dueDate } = req.body;
      const workspaceId = await resolveWorkspace(req);

      if (title === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "title" is required.',
        });
      }

      let normalizedTitle;
      let normalizedDetails = null;
      let normalizedStatus = 'pending';
      let normalizedPriority = 'none';
      let normalizedDueDate = null;

      try {
        normalizedTitle = taskRepository.validateAndNormalizeTaskTitle(title);
        if (details !== undefined) {
          normalizedDetails = taskRepository.validateAndNormalizeTaskDetails(details);
        }
        if (status !== undefined) {
          normalizedStatus = taskRepository.validateTaskStatus(status);
        }
        if (priority !== undefined) {
          normalizedPriority = taskRepository.validateTaskPriority(priority);
        }
        if (dueDate !== undefined) {
          normalizedDueDate = taskRepository.validateTaskDueDate(dueDate);
        }
      } catch (validationErr) {
        return res.status(validationErr.status || 400).json({
          error: 'BadRequest',
          message: validationErr.message,
        });
      }

      const created = await taskRepository.createTask({
        userId: req.user.id,
        workspaceId,
        title: normalizedTitle,
        details: normalizedDetails,
        status: normalizedStatus,
        priority: normalizedPriority,
        dueDate: normalizedDueDate,
      });

      return res.status(201).json(created);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/tasks/:id
   * Retrieves an owned, active task.
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid task ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const task = await taskRepository.findTaskByIdAndUserId({
        id,
        userId: req.user.id,
        workspaceId,
      });

      if (!task) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Task not found.',
        });
      }

      return res.status(200).json(task);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PATCH /api/tasks/:id
   * Updates an owned, active task.
   */
  router.patch('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid task ID format.',
        });
      }

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set(['title', 'details', 'status', 'priority', 'dueDate', 'workspaceId']);
      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const { title, details, status, priority, dueDate } = req.body;
      const workspaceId = await resolveWorkspace(req);

      try {
        if (title !== undefined) {
          taskRepository.validateAndNormalizeTaskTitle(title);
        }
        if (details !== undefined) {
          taskRepository.validateAndNormalizeTaskDetails(details);
        }
        if (status !== undefined) {
          taskRepository.validateTaskStatus(status);
        }
        if (priority !== undefined) {
          taskRepository.validateTaskPriority(priority);
        }
        if (dueDate !== undefined) {
          taskRepository.validateTaskDueDate(dueDate);
        }
      } catch (validationErr) {
        return res.status(validationErr.status || 400).json({
          error: 'BadRequest',
          message: validationErr.message,
        });
      }

      const result = await taskRepository.updateTask({
        id,
        userId: req.user.id,
        workspaceId,
        title,
        details,
        status,
        priority,
        dueDate,
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Task not found.',
        });
      }

      return res.status(200).json(result.task);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/tasks/:id/complete
   * Convenience endpoint to set status = 'completed'.
   */
  router.post('/:id/complete', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid task ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const result = await taskRepository.setTaskStatus({
        id,
        userId: req.user.id,
        workspaceId,
        status: 'completed',
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Task not found.',
        });
      }

      return res.status(200).json(result.task);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/tasks/:id/reopen
   * Convenience endpoint to set status = 'pending'.
   */
  router.post('/:id/reopen', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid task ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const result = await taskRepository.setTaskStatus({
        id,
        userId: req.user.id,
        workspaceId,
        status: 'pending',
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Task not found.',
        });
      }

      return res.status(200).json(result.task);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * DELETE /api/tasks/:id
   * Soft-deletes an owned task.
   */
  router.delete('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid task ID format.',
        });
      }

      const workspaceId = await resolveWorkspace(req);
      const result = await taskRepository.softDeleteTask({
        id,
        userId: req.user.id,
        workspaceId,
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Task not found.',
        });
      }

      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export const tasksRoutes = createTasksRouter();
export default tasksRoutes;
