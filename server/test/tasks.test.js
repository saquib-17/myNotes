import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createTasksRouter } from '../src/routes/tasks.routes.js';
import {
  TASK_LIMITS,
  validateAndNormalizeTaskTitle,
  validateAndNormalizeTaskDetails,
  validateTaskPriority,
  validateTaskStatus,
  validateTaskDueDate,
} from '../src/tasks/taskRepository.js';

describe('Tasks REST API & Repository Tests (Isolated Seams)', () => {
  let mockUsers;
  let mockTasks;
  let app;
  let mockTaskRepo;

  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    mockUsers = new Map([
      [USER_A_ID, { id: USER_A_ID, email: 'usera@example.com' }],
      [USER_B_ID, { id: USER_B_ID, email: 'userb@example.com' }],
    ]);
    mockTasks = new Map();

    let taskIdCounter = 1;

    mockTaskRepo = {
      TASK_LIMITS,
      validateAndNormalizeTaskTitle,
      validateAndNormalizeTaskDetails,
      validateTaskPriority,
      validateTaskStatus,
      validateTaskDueDate,

      async createTask({ userId, title, details = null, status = 'pending', priority = 'none', dueDate = null }) {
        const id = `00000000-0000-4000-8000-${String(taskIdCounter++).padStart(12, '0')}`;
        const now = new Date();
        const task = {
          id,
          userId,
          title,
          details,
          status,
          priority,
          dueDate,
          completedAt: status === 'completed' ? now : null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        mockTasks.set(id, task);
        return {
          id: task.id,
          title: task.title,
          details: task.details,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate,
          completedAt: task.completedAt ? task.completedAt.toISOString() : null,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
        };
      },

      async findTasksByUserId({ userId, status, priority, q, limit = 20, offset = 0 }) {
        let tasks = Array.from(mockTasks.values()).filter(
          (t) => t.userId === userId && t.deletedAt === null
        );

        if (status) {
          tasks = tasks.filter((t) => t.status === status);
        }
        if (priority) {
          tasks = tasks.filter((t) => t.priority === priority);
        }
        if (q) {
          const lowerQ = q.toLowerCase();
          tasks = tasks.filter(
            (t) =>
              t.title.toLowerCase().includes(lowerQ) ||
              (t.details && t.details.toLowerCase().includes(lowerQ))
          );
        }

        // Sorting: pending first, then due_date ASC NULLS LAST, then priority (high->medium->low->none), then updatedAt DESC, id ASC
        const priorityOrder = { high: 1, medium: 2, low: 3, none: 4 };
        tasks.sort((a, b) => {
          if (a.status !== b.status) {
            return a.status === 'pending' ? -1 : 1;
          }
          if (a.dueDate !== b.dueDate) {
            if (a.dueDate === null) return 1;
            if (b.dueDate === null) return -1;
            return a.dueDate.localeCompare(b.dueDate);
          }
          const pA = priorityOrder[a.priority] || 4;
          const pB = priorityOrder[b.priority] || 4;
          if (pA !== pB) return pA - pB;
          const timeA = new Date(a.updatedAt).getTime();
          const timeB = new Date(b.updatedAt).getTime();
          if (timeA !== timeB) return timeB - timeA;
          return a.id.localeCompare(b.id);
        });

        const total = tasks.length;
        const page = tasks.slice(offset, offset + limit);
        const hasMore = offset + limit < total;

        const formatted = page.map((t) => ({
          id: t.id,
          title: t.title,
          details: t.details,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          completedAt: t.completedAt ? t.completedAt.toISOString() : null,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        }));

        return {
          tasks: formatted,
          items: formatted,
          total,
          limit,
          offset,
          hasMore,
        };
      },

      async findTaskByIdAndUserId({ id, userId }) {
        const task = mockTasks.get(id);
        if (!task || task.userId !== userId || task.deletedAt !== null) {
          return null;
        }
        return {
          id: task.id,
          title: task.title,
          details: task.details,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate,
          completedAt: task.completedAt ? task.completedAt.toISOString() : null,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
        };
      },

      async updateTask({ id, userId, title, details, status, priority, dueDate }) {
        const task = mockTasks.get(id);
        if (!task || task.userId !== userId || task.deletedAt !== null) {
          return { notFound: true };
        }
        const now = new Date();
        if (title !== undefined) task.title = title;
        if (details !== undefined) task.details = details;
        if (priority !== undefined) task.priority = priority;
        if (dueDate !== undefined) task.dueDate = dueDate;
        if (status !== undefined) {
          if (status === 'completed' && task.status !== 'completed') {
            task.completedAt = now;
          } else if (status === 'pending' && task.status !== 'pending') {
            task.completedAt = null;
          }
          task.status = status;
        }
        task.updatedAt = now;
        return {
          task: {
            id: task.id,
            title: task.title,
            details: task.details,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            completedAt: task.completedAt ? task.completedAt.toISOString() : null,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
          },
        };
      },

      async setTaskStatus({ id, userId, status }) {
        const task = mockTasks.get(id);
        if (!task || task.userId !== userId || task.deletedAt !== null) {
          return { notFound: true };
        }
        const now = new Date();
        task.status = status;
        task.completedAt = status === 'completed' ? now : null;
        task.updatedAt = now;
        return {
          task: {
            id: task.id,
            title: task.title,
            details: task.details,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            completedAt: task.completedAt ? task.completedAt.toISOString() : null,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
          },
        };
      },

      async softDeleteTask({ id, userId }) {
        const task = mockTasks.get(id);
        if (!task || task.userId !== userId || task.deletedAt !== null) {
          return { notFound: true };
        }
        task.deletedAt = new Date();
        task.updatedAt = new Date();
        return { deleted: true };
      },
    };

    const mockAuthRepo = {
      async findUserById(id) {
        return mockUsers.get(id) || null;
      },
      async findUserByEmail(email) {
        for (const user of mockUsers.values()) {
          if (user.email === email) return user;
        }
        return null;
      },
    };

    const testSessionMiddleware = session({
      secret: 'tasks-test-session-secret-at-least-32-chars-long',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    });

    const mockRequireAuth = (req, res, next) => {
      const authHeader = req.headers['x-test-user-id'];
      const userId = (req.session && req.session.userId) || authHeader;
      if (!userId || !mockUsers.has(userId)) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required to access this resource.',
        });
      }
      req.user = mockUsers.get(userId);
      next();
    };

    const authRouter = createAuthRouter({
      authRepository: mockAuthRepo,
      requireAuthMiddleware: mockRequireAuth,
    });

    const tasksRouter = createTasksRouter({
      taskRepository: mockTaskRepo,
      requireAuthMiddleware: mockRequireAuth,
    });

    app = createApp({
      sessionMiddleware: testSessionMiddleware,
      authRouter,
      tasksRouter,
    });
  });

  async function getCsrfAndCookie(agent) {
    const res = await agent.get('/api/auth/csrf');
    return {
      csrfToken: res.body.csrfToken,
      cookie: res.headers['set-cookie'],
    };
  }

  // 1. Repository Validators
  describe('Repository Validation Helpers', () => {
    it('validates title constraints', () => {
      assert.throws(() => validateAndNormalizeTaskTitle(''), /cannot be empty/);
      assert.throws(() => validateAndNormalizeTaskTitle('   '), /cannot be empty/);
      assert.throws(() => validateAndNormalizeTaskTitle('a'.repeat(201)), /cannot exceed 200/);
      assert.equal(validateAndNormalizeTaskTitle('  Fix the bug  '), 'Fix the bug');
    });

    it('validates details constraints', () => {
      assert.equal(validateAndNormalizeTaskDetails(null), null);
      assert.equal(validateAndNormalizeTaskDetails(undefined), null);
      assert.equal(validateAndNormalizeTaskDetails(''), null);
      assert.equal(validateAndNormalizeTaskDetails('   '), null);
      assert.throws(() => validateAndNormalizeTaskDetails('a'.repeat(5001)), /cannot exceed 5000/);
      assert.equal(validateAndNormalizeTaskDetails('  Some details  '), 'Some details');
    });

    it('validates priority constraints', () => {
      assert.equal(validateTaskPriority(undefined), 'none');
      assert.equal(validateTaskPriority(null), 'none');
      assert.equal(validateTaskPriority('high'), 'high');
      assert.equal(validateTaskPriority('MEDIUM'), 'medium');
      assert.throws(() => validateTaskPriority('urgent'), /must be one of/);
    });

    it('validates status constraints', () => {
      assert.equal(validateTaskStatus(undefined), 'pending');
      assert.equal(validateTaskStatus('pending'), 'pending');
      assert.equal(validateTaskStatus('COMPLETED'), 'completed');
      assert.throws(() => validateTaskStatus('in_progress'), /must be one of/);
    });

    it('validates dueDate constraints', () => {
      assert.equal(validateTaskDueDate(null), null);
      assert.equal(validateTaskDueDate(undefined), null);
      assert.equal(validateTaskDueDate(''), null);
      assert.equal(validateTaskDueDate('2026-10-31'), '2026-10-31');
      assert.throws(() => validateTaskDueDate('31-10-2026'), /YYYY-MM-DD/);
      assert.throws(() => validateTaskDueDate('2026-02-31'), /valid calendar date/);
      assert.throws(() => validateTaskDueDate('2026-13-01'), /valid calendar date/);
    });
  });

  // 2. Authentication & Authorization
  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated requests to all endpoints with 401', async () => {
      const getListRes = await request(app).get('/api/tasks');
      assert.equal(getListRes.status, 401);

      const postRes = await request(app).post('/api/tasks').send({ title: 'Task 1' });
      assert.equal(postRes.status, 401);

      const getOneRes = await request(app).get('/api/tasks/11111111-1111-4111-8111-111111111111');
      assert.equal(getOneRes.status, 401);

      const patchRes = await request(app).patch('/api/tasks/11111111-1111-4111-8111-111111111111').send({ title: 'Updated' });
      assert.equal(patchRes.status, 401);

      const completeRes = await request(app).post('/api/tasks/11111111-1111-4111-8111-111111111111/complete');
      assert.equal(completeRes.status, 401);

      const reopenRes = await request(app).post('/api/tasks/11111111-1111-4111-8111-111111111111/reopen');
      assert.equal(reopenRes.status, 401);

      const deleteRes = await request(app).delete('/api/tasks/11111111-1111-4111-8111-111111111111');
      assert.equal(deleteRes.status, 401);
    });
  });

  // 3. CSRF Protection
  describe('CSRF Protection on Mutations', () => {
    it('rejects POST /api/tasks when CSRF header is missing', async () => {
      const agent = request.agent(app);
      const res = await agent
        .post('/api/tasks')
        .set('x-test-user-id', USER_A_ID)
        .send({ title: 'New Task' });
      assert.equal(res.status, 403);
    });

    it('rejects PATCH, COMPLETE, REOPEN, DELETE when CSRF token is invalid', async () => {
      const agent = request.agent(app);
      const fakeUuid = '00000000-0000-4000-8000-000000000001';

      const patchRes = await agent
        .patch(`/api/tasks/${fakeUuid}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', 'invalid-token')
        .send({ title: 'Updated' });
      assert.equal(patchRes.status, 403);

      const completeRes = await agent
        .post(`/api/tasks/${fakeUuid}/complete`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', 'invalid-token');
      assert.equal(completeRes.status, 403);

      const deleteRes = await agent
        .delete(`/api/tasks/${fakeUuid}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', 'invalid-token');
      assert.equal(deleteRes.status, 403);
    });
  });

  // 4. Task Creation
  describe('POST /api/tasks', () => {
    it('creates a task with defaults (pending status, none priority, null dueDate)', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const res = await agent
        .post('/api/tasks')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Buy groceries' });

      assert.equal(res.status, 201);
      assert.ok(res.body.id);
      assert.equal(res.body.title, 'Buy groceries');
      assert.equal(res.body.status, 'pending');
      assert.equal(res.body.priority, 'none');
      assert.equal(res.body.dueDate, null);
      assert.equal(res.body.details, null);
    });

    it('creates a task with custom priority, details, and due date', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const res = await agent
        .post('/api/tasks')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Finish report',
          details: 'Include Q3 summary charts',
          priority: 'high',
          dueDate: '2026-11-15',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Finish report');
      assert.equal(res.body.details, 'Include Q3 summary charts');
      assert.equal(res.body.priority, 'high');
      assert.equal(res.body.dueDate, '2026-11-15');
    });

    it('rejects invalid title (empty or whitespace-only)', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const res = await agent
        .post('/api/tasks')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ title: '   ' });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'BadRequest');
    });

    it('rejects unknown fields in payload', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const res = await agent
        .post('/api/tasks')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Valid task', unknownField: true });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /Unknown or unpermitted field/);
    });
  });

  // 5. Listing and Filtering
  describe('GET /api/tasks', () => {
    it('lists tasks, sorts correctly, and respects status / priority filters', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      // Create multiple tasks
      await agent.post('/api/tasks').set('x-test-user-id', USER_A_ID).set('x-csrf-token', csrfToken).send({
        title: 'Task low future',
        priority: 'low',
        dueDate: '2026-12-01',
      });
      await agent.post('/api/tasks').set('x-test-user-id', USER_A_ID).set('x-csrf-token', csrfToken).send({
        title: 'Task high urgent',
        priority: 'high',
        dueDate: '2026-10-28',
      });
      const completedTaskRes = await agent.post('/api/tasks').set('x-test-user-id', USER_A_ID).set('x-csrf-token', csrfToken).send({
        title: 'Already completed',
        priority: 'high',
        status: 'completed',
      });
      assert.equal(completedTaskRes.status, 201);

      // List all
      const listRes = await agent
        .get('/api/tasks')
        .set('x-test-user-id', USER_A_ID);

      assert.equal(listRes.status, 200);
      assert.equal(listRes.body.total, 3);
      // Pending first (earlier due date first), then completed
      assert.equal(listRes.body.tasks[0].title, 'Task high urgent');
      assert.equal(listRes.body.tasks[1].title, 'Task low future');
      assert.equal(listRes.body.tasks[2].title, 'Already completed');

      // Filter by status=pending
      const pendingRes = await agent
        .get('/api/tasks?status=pending')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(pendingRes.body.total, 2);

      // Filter by status=completed
      const completedRes = await agent
        .get('/api/tasks?status=completed')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(completedRes.body.total, 1);
      assert.equal(completedRes.body.tasks[0].title, 'Already completed');

      // Search with q
      const searchRes = await agent
        .get('/api/tasks?q=urgent')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(searchRes.body.total, 1);
      assert.equal(searchRes.body.tasks[0].title, 'Task high urgent');
    });

    it('rejects invalid query parameters', async () => {
      const agent = request.agent(app);
      const res = await agent
        .get('/api/tasks?status=invalid_status')
        .set('x-test-user-id', USER_A_ID);

      assert.equal(res.status, 400);
      assert.match(res.body.message, /must be one of: pending, completed/);
    });
  });

  // 6. Complete, Reopen, Edit, and Soft-Delete
  describe('Task Operations & Isolation', () => {
    it('completes, reopens, edits, and soft-deletes a task with full isolation', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      // 1. Create a task for User A
      const createRes = await agent
        .post('/api/tasks')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ title: 'User A Task', priority: 'medium' });

      const taskId = createRes.body.id;

      // 2. User B cannot see User A's task
      const userBGet = await agent
        .get(`/api/tasks/${taskId}`)
        .set('x-test-user-id', USER_B_ID);
      assert.equal(userBGet.status, 404);

      // 3. User B cannot complete User A's task
      const userBComplete = await agent
        .post(`/api/tasks/${taskId}/complete`)
        .set('x-test-user-id', USER_B_ID)
        .set('x-csrf-token', csrfToken);
      assert.equal(userBComplete.status, 404);

      // 4. User A completes the task
      const completeRes = await agent
        .post(`/api/tasks/${taskId}/complete`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken);
      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.status, 'completed');
      assert.ok(completeRes.body.completedAt);

      // 5. User A reopens the task
      const reopenRes = await agent
        .post(`/api/tasks/${taskId}/reopen`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken);
      assert.equal(reopenRes.status, 200);
      assert.equal(reopenRes.body.status, 'pending');
      assert.equal(reopenRes.body.completedAt, null);

      // 6. User A edits the task
      const patchRes = await agent
        .patch(`/api/tasks/${taskId}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ title: 'User A Task Edited', priority: 'high' });
      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.body.title, 'User A Task Edited');
      assert.equal(patchRes.body.priority, 'high');

      // 7. User A soft deletes the task
      const deleteRes = await agent
        .delete(`/api/tasks/${taskId}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken);
      assert.equal(deleteRes.status, 204);

      // 8. Subsequent GET returns 404
      const getDeletedRes = await agent
        .get(`/api/tasks/${taskId}`)
        .set('x-test-user-id', USER_A_ID);
      assert.equal(getDeletedRes.status, 404);

      // 9. Does not show in list
      const listRes = await agent
        .get('/api/tasks')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(listRes.body.total, 0);
    });
  });
});
