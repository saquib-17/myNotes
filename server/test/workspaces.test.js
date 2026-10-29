import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createWorkspacesRouter } from '../src/routes/workspaces.routes.js';
import { DuplicateWorkspaceNameError } from '../src/workspaces/workspaceRepository.js';

describe('Workspaces Backend Unit & Integration Tests (Isolated Seams)', () => {
  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';
  const WS_DEFAULT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const WS_CUSTOM_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const WS_DEFAULT_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const VALID_CSRF_TOKEN = 'test-csrf-token-12345678901234567890123456789012';

  let mockWorkspaces;
  let mockWorkspaceRepo;
  let activeUser;

  function fakeAuth(req, res, next) {
    if (!activeUser) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }
    req.user = activeUser;
    next();
  }

  function fakeSession(req, res, next) {
    req.session = {
      csrfToken: VALID_CSRF_TOKEN,
    };
    next();
  }

  beforeEach(() => {
    activeUser = { id: USER_A_ID, email: 'usera@example.com' };
    mockWorkspaces = new Map([
      [
        WS_DEFAULT_A,
        {
          id: WS_DEFAULT_A,
          userId: USER_A_ID,
          name: 'Default',
          isDefault: true,
          deletedAt: null,
          createdAt: new Date('2026-10-26T10:00:00Z'),
          updatedAt: new Date('2026-10-26T10:00:00Z'),
        },
      ],
      [
        WS_DEFAULT_B,
        {
          id: WS_DEFAULT_B,
          userId: USER_B_ID,
          name: 'Default',
          isDefault: true,
          deletedAt: null,
          createdAt: new Date('2026-10-26T10:00:00Z'),
          updatedAt: new Date('2026-10-26T10:00:00Z'),
        },
      ],
    ]);

    mockWorkspaceRepo = {
      findWorkspacesByUserId: async (userId) => {
        const list = Array.from(mockWorkspaces.values()).filter(
          (w) => w.userId === userId && w.deletedAt === null
        );
        list.sort((a, b) => {
          if (b.isDefault !== a.isDefault) return b.isDefault ? 1 : -1;
          return a.name.localeCompare(b.name);
        });
        return list;
      },

      findWorkspaceByIdAndUserId: async (id, userId) => {
        const ws = mockWorkspaces.get(id);
        if (!ws || ws.userId !== userId || ws.deletedAt !== null) return null;
        return ws;
      },

      findDefaultWorkspaceByUserId: async (userId) => {
        return (
          Array.from(mockWorkspaces.values()).find(
            (w) => w.userId === userId && w.isDefault && w.deletedAt === null
          ) || null
        );
      },

      createWorkspace: async ({ userId, name, isDefault = false }) => {
        const trimmed = (name || '').trim();
        const dup = Array.from(mockWorkspaces.values()).find(
          (w) =>
            w.userId === userId &&
            w.deletedAt === null &&
            w.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (dup) {
          throw new DuplicateWorkspaceNameError(`A workspace named "${trimmed}" already exists.`);
        }
        const id = WS_CUSTOM_A;
        const ws = {
          id,
          userId,
          name: trimmed,
          isDefault: Boolean(isDefault),
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockWorkspaces.set(id, ws);
        return ws;
      },

      updateWorkspace: async ({ id, userId, name }) => {
        const ws = mockWorkspaces.get(id);
        if (!ws || ws.userId !== userId || ws.deletedAt !== null) {
          const err = new Error('Workspace not found.');
          err.status = 404;
          throw err;
        }
        const trimmed = (name || '').trim();
        const dup = Array.from(mockWorkspaces.values()).find(
          (w) =>
            w.userId === userId &&
            w.id !== id &&
            w.deletedAt === null &&
            w.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (dup) {
          throw new DuplicateWorkspaceNameError(`A workspace named "${trimmed}" already exists.`);
        }
        ws.name = trimmed;
        ws.updatedAt = new Date();
        return ws;
      },

      softDeleteWorkspace: async ({ id, userId }) => {
        const ws = mockWorkspaces.get(id);
        if (!ws || ws.userId !== userId || ws.deletedAt !== null) {
          const err = new Error('Workspace not found.');
          err.status = 404;
          throw err;
        }
        if (ws.isDefault) {
          const err = new Error('Cannot delete the default workspace.');
          err.status = 400;
          throw err;
        }
        const activeCount = Array.from(mockWorkspaces.values()).filter(
          (w) => w.userId === userId && w.deletedAt === null
        ).length;
        if (activeCount <= 1) {
          const err = new Error('Cannot delete your only active workspace.');
          err.status = 400;
          throw err;
        }
        ws.deletedAt = new Date();
        return true;
      },

      setDefaultWorkspace: async ({ id, userId }) => {
        const ws = mockWorkspaces.get(id);
        if (!ws || ws.userId !== userId || ws.deletedAt !== null) {
          const err = new Error('Workspace not found.');
          err.status = 404;
          throw err;
        }
        for (const w of mockWorkspaces.values()) {
          if (w.userId === userId && w.isDefault && w.id !== id) {
            w.isDefault = false;
          }
        }
        ws.isDefault = true;
        ws.updatedAt = new Date();
        return ws;
      },

      ensureDefaultWorkspaceForUser: async ({ userId }) => {
        let def = Array.from(mockWorkspaces.values()).find(
          (w) => w.userId === userId && w.isDefault && w.deletedAt === null
        );
        if (def) return def;
        const id = `00000000-0000-4000-8000-${Date.now()}`;
        def = {
          id,
          userId,
          name: 'Default',
          isDefault: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockWorkspaces.set(id, def);
        return def;
      },
    };
  });

  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated requests to all endpoints with 401', async () => {
      activeUser = null;
      const app = createApp({
        sessionMiddleware: fakeSession,
        workspacesRouter: createWorkspacesRouter({
          workspaceRepository: mockWorkspaceRepo,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const resGet = await request(app).get('/api/workspaces');
      assert.strictEqual(resGet.status, 401);

      const resPost = await request(app)
        .post('/api/workspaces')
        .set('x-csrf-token', VALID_CSRF_TOKEN)
        .send({ name: 'Work' });
      assert.strictEqual(resPost.status, 401);

      const resPatch = await request(app)
        .patch(`/api/workspaces/${WS_DEFAULT_A}`)
        .set('x-csrf-token', VALID_CSRF_TOKEN)
        .send({ name: 'Work' });
      assert.strictEqual(resPatch.status, 401);

      const resDelete = await request(app)
        .delete(`/api/workspaces/${WS_DEFAULT_A}`)
        .set('x-csrf-token', VALID_CSRF_TOKEN);
      assert.strictEqual(resDelete.status, 401);

      const resSetDef = await request(app)
        .post(`/api/workspaces/${WS_DEFAULT_A}/set-default`)
        .set('x-csrf-token', VALID_CSRF_TOKEN);
      assert.strictEqual(resSetDef.status, 401);
    });

    it('rejects state-changing requests without valid CSRF token with 403', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        workspacesRouter: createWorkspacesRouter({
          workspaceRepository: mockWorkspaceRepo,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const resPost = await request(app).post('/api/workspaces').send({ name: 'Work' });
      assert.strictEqual(resPost.status, 403);
    });

    it('rejects unauthenticated requests with 401 using default router instantiation', async () => {
      const defaultRouter = createWorkspacesRouter();
      const app = createApp({
        workspacesRouter: defaultRouter,
      });

      const resGet = await request(app).get('/api/workspaces');
      assert.strictEqual(resGet.status, 401);
      assert.strictEqual(resGet.body.error, 'Unauthorized');
    });
  });

  describe('Workspaces CRUD and Lifecycle', () => {
    it('lists workspaces for authenticated user sorted default first', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        workspacesRouter: createWorkspacesRouter({
          workspaceRepository: mockWorkspaceRepo,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      // Add a custom workspace
      mockWorkspaces.set(WS_CUSTOM_A, {
        id: WS_CUSTOM_A,
        userId: USER_A_ID,
        name: 'College',
        isDefault: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app).get('/api/workspaces');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.workspaces));
      assert.strictEqual(res.body.workspaces.length, 2);
      assert.strictEqual(res.body.workspaces[0].name, 'Default');
      assert.strictEqual(res.body.workspaces[0].isDefault, true);
      assert.strictEqual(res.body.workspaces[1].name, 'College');
      assert.strictEqual(res.body.workspaces[1].isDefault, false);
    });

    it('creates a workspace with valid name and rejects empty or too long names', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        workspacesRouter: createWorkspacesRouter({
          workspaceRepository: mockWorkspaceRepo,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const resBad1 = await request(app)
        .post('/api/workspaces')
        .set('x-csrf-token', VALID_CSRF_TOKEN)
        .send({ name: '' });
      assert.strictEqual(resBad1.status, 400);

      const resBad2 = await request(app)
        .post('/api/workspaces')
        .set('x-csrf-token', VALID_CSRF_TOKEN)
        .send({ name: '   ' });
      assert.strictEqual(resBad2.status, 400);

      const resBad3 = await request(app)
        .post('/api/workspaces')
        .set('x-csrf-token', VALID_CSRF_TOKEN)
        .send({ name: 'a'.repeat(61) });
      assert.strictEqual(resBad3.status, 400);

      const resGood = await request(app)
        .post('/api/workspaces')
        .set('x-csrf-token', VALID_CSRF_TOKEN)
        .send({ name: 'Projects' });
      assert.strictEqual(resGood.status, 201);
      assert.strictEqual(resGood.body.workspace.name, 'Projects');
      assert.strictEqual(resGood.body.workspace.isDefault, false);
    });

    it('rejects duplicate active workspace name with 409 Conflict', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        workspacesRouter: createWorkspacesRouter({
          workspaceRepository: mockWorkspaceRepo,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const res = await request(app)
        .post('/api/workspaces')
        .set('x-csrf-token', VALID_CSRF_TOKEN)
        .send({ name: 'default' });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error, 'Conflict');
    });

    it('renames an active workspace and prevents duplicate renaming', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        workspacesRouter: createWorkspacesRouter({
          workspaceRepository: mockWorkspaceRepo,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      mockWorkspaces.set(WS_CUSTOM_A, {
        id: WS_CUSTOM_A,
        userId: USER_A_ID,
        name: 'College',
        isDefault: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .patch(`/api/workspaces/${WS_CUSTOM_A}`)
        .set('x-csrf-token', VALID_CSRF_TOKEN)
        .send({ name: 'University' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.workspace.name, 'University');

      // Duplicate rename
      const resDup = await request(app)
        .patch(`/api/workspaces/${WS_CUSTOM_A}`)
        .set('x-csrf-token', VALID_CSRF_TOKEN)
        .send({ name: 'Default' });
      assert.strictEqual(resDup.status, 409);
    });

    it('prevents deleting default workspace and only active workspace', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        workspacesRouter: createWorkspacesRouter({
          workspaceRepository: mockWorkspaceRepo,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      // Try deleting default
      const resDef = await request(app)
        .delete(`/api/workspaces/${WS_DEFAULT_A}`)
        .set('x-csrf-token', VALID_CSRF_TOKEN);
      assert.strictEqual(resDef.status, 400);

      // Add a custom workspace
      mockWorkspaces.set(WS_CUSTOM_A, {
        id: WS_CUSTOM_A,
        userId: USER_A_ID,
        name: 'College',
        isDefault: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Successfully delete non-default custom workspace
      const resDel = await request(app)
        .delete(`/api/workspaces/${WS_CUSTOM_A}`)
        .set('x-csrf-token', VALID_CSRF_TOKEN);
      assert.strictEqual(resDel.status, 204);
      assert.ok(mockWorkspaces.get(WS_CUSTOM_A).deletedAt !== null);
    });

    it('sets a new default workspace and unsets the previous default', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        workspacesRouter: createWorkspacesRouter({
          workspaceRepository: mockWorkspaceRepo,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      mockWorkspaces.set(WS_CUSTOM_A, {
        id: WS_CUSTOM_A,
        userId: USER_A_ID,
        name: 'College',
        isDefault: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/workspaces/${WS_CUSTOM_A}/set-default`)
        .set('x-csrf-token', VALID_CSRF_TOKEN);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.workspace.id, WS_CUSTOM_A);
      assert.strictEqual(res.body.workspace.isDefault, true);

      assert.strictEqual(mockWorkspaces.get(WS_DEFAULT_A).isDefault, false);
      assert.strictEqual(mockWorkspaces.get(WS_CUSTOM_A).isDefault, true);
    });
  });

  describe('Multi-tenant Workspace Isolation', () => {
    it('prevents User A from accessing or modifying User B workspace (404)', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        workspacesRouter: createWorkspacesRouter({
          workspaceRepository: mockWorkspaceRepo,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const resPatch = await request(app)
        .patch(`/api/workspaces/${WS_DEFAULT_B}`)
        .set('x-csrf-token', VALID_CSRF_TOKEN)
        .send({ name: 'Hacked' });
      assert.strictEqual(resPatch.status, 404);

      const resDelete = await request(app)
        .delete(`/api/workspaces/${WS_DEFAULT_B}`)
        .set('x-csrf-token', VALID_CSRF_TOKEN);
      assert.strictEqual(resDelete.status, 404);

      const resSetDef = await request(app)
        .post(`/api/workspaces/${WS_DEFAULT_B}/set-default`)
        .set('x-csrf-token', VALID_CSRF_TOKEN);
      assert.strictEqual(resSetDef.status, 404);
    });
  });
});

