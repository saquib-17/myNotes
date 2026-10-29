import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createSearchRouter } from '../src/routes/search.routes.js';
import {
  escapeLikeWildcards,
  extractSnippet,
} from '../src/search/searchRepository.js';

describe('Global Search Backend Unit & Integration Tests (Isolated Seams)', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
  const WS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const OTHER_WS_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  let mockSearchRepo;
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
      userId: activeUser?.id,
    };
    next();
  }

  async function mockResolveWorkspace(req) {
    const ws = req.query?.workspaceId || req.headers?.['x-workspace-id'] || WS_ID;
    if (ws === 'invalid-uuid') {
      const err = new Error('Invalid workspace ID format.');
      err.status = 400;
      throw err;
    }
    return ws;
  }

  beforeEach(() => {
    activeUser = { id: USER_ID, email: 'user@example.com' };

    mockSearchRepo = {
      performGlobalSearch: async ({ userId, workspaceId, q, type = 'all', limit = 20, offset = 0 }) => {
        if (userId !== USER_ID || workspaceId !== WS_ID) {
          return {
            query: q,
            workspaceId,
            type,
            total: 0,
            limit,
            offset,
            hasMore: false,
            results: [],
          };
        }

        const allItems = [
          {
            id: 'n1111111-1111-4111-8111-111111111111',
            type: 'notes',
            title: 'React Architecture Note',
            subtitle: 'Pinned Note',
            snippet: 'Deep dive into React components and patterns…',
            url: '/notes/n1111111-1111-4111-8111-111111111111',
            updatedAt: '2026-10-28T09:00:00.000Z',
            badges: ['Pinned'],
          },
          {
            id: 't2222222-2222-4222-8222-222222222222',
            type: 'tasks',
            title: 'Fix React hydration bug',
            subtitle: 'Task • Pending • Due 2026-11-01',
            snippet: 'Hydration issue in server rendering…',
            url: '/tasks',
            updatedAt: '2026-10-28T08:00:00.000Z',
            badges: ['Pending', 'HIGH'],
          },
          {
            id: 'q3333333-3333-4333-8333-333333333333',
            type: 'questions',
            title: 'What is React Fiber reconciliation?',
            subtitle: 'Question • SHORT_ANSWER • Frontend',
            snippet: 'Fiber is the reimplementation of React core algorithm…',
            url: '/questions',
            updatedAt: '2026-10-28T07:00:00.000Z',
            badges: ['SHORT_ANSWER', 'Frontend'],
          },
          {
            id: 'd4444444-4444-4444-8444-444444444444',
            type: 'documents',
            title: 'Official React Documentation',
            subtitle: 'Document • Documentation • React',
            snippet: 'Comprehensive guide to modern React with hooks…',
            url: '/documents',
            updatedAt: '2026-10-28T06:00:00.000Z',
            badges: ['Documentation', 'Favorite'],
          },
          {
            id: 'r5555555-5555-4555-8555-555555555555',
            type: 'revision',
            title: 'Revise React useEffect dependencies',
            subtitle: 'Revision • Web Dev • Pending',
            snippet: 'Key nuances of closure staleness in useEffect…',
            url: '/revision',
            updatedAt: '2026-10-28T05:00:00.000Z',
            badges: ['Pending', 'Priority: HIGH'],
          },
          {
            id: 'b6666666-6666-4666-8666-666666666666',
            type: 'doubts',
            title: 'Why use useSyncExternalStore in React?',
            subtitle: 'Doubt • State Management • Open',
            snippet: 'Needed to prevent tearing during concurrent rendering…',
            url: '/revision',
            updatedAt: '2026-10-28T04:00:00.000Z',
            badges: ['Open', 'State Management'],
          },
        ];

        let filtered = allItems;
        if (type !== 'all') {
          filtered = allItems.filter((item) => item.type === type);
        }

        const sliced = filtered.slice(offset, offset + limit);

        return {
          query: q,
          workspaceId,
          type,
          total: filtered.length,
          limit,
          offset,
          hasMore: offset + sliced.length < filtered.length,
          results: sliced,
        };
      },
    };
  });

  describe('Search Utility Functions', () => {
    it('escapes SQL LIKE special characters correctly', () => {
      assert.strictEqual(escapeLikeWildcards('normal'), 'normal');
      assert.strictEqual(escapeLikeWildcards('50% off'), '50\\% off');
      assert.strictEqual(escapeLikeWildcards('user_name'), 'user\\_name');
      assert.strictEqual(escapeLikeWildcards('c:\\path'), 'c:\\\\path');
      assert.strictEqual(escapeLikeWildcards('100%_test\\done'), '100\\%\\_test\\\\done');
    });

    it('extracts snippets centered around matched query', () => {
      const longText =
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';

      const snippet = extractSnippet(longText, 'tempor', 50);
      assert.ok(snippet.toLowerCase().includes('tempor'));
      assert.ok(snippet.startsWith('…'));
      assert.ok(snippet.endsWith('…'));

      // If query not present, returns truncated text
      const fallbackSnippet = extractSnippet(longText, 'nonexistent', 30);
      assert.ok(fallbackSnippet.endsWith('…'));
      assert.strictEqual(fallbackSnippet.startsWith('…'), false);
    });
  });

  describe('Authentication and Query Parameter Validation', () => {
    it('rejects unauthenticated requests with 401', async () => {
      activeUser = null;
      const app = createApp({
        sessionMiddleware: fakeSession,
        searchRouter: createSearchRouter({
          searchRepository: mockSearchRepo,
          resolveWorkspace: mockResolveWorkspace,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const res = await request(app).get('/api/search?q=test');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error, 'Unauthorized');
    });

    it('rejects missing or empty search query with 400', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        searchRouter: createSearchRouter({
          searchRepository: mockSearchRepo,
          resolveWorkspace: mockResolveWorkspace,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const resMissing = await request(app).get('/api/search');
      assert.strictEqual(resMissing.status, 400);
      assert.strictEqual(resMissing.body.error, 'BadRequest');
      assert.ok(resMissing.body.message.includes('required'));

      const resEmpty = await request(app).get('/api/search?q=   ');
      assert.strictEqual(resEmpty.status, 400);
      assert.strictEqual(resEmpty.body.error, 'BadRequest');
    });

    it('rejects search query exceeding 200 characters with 400', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        searchRouter: createSearchRouter({
          searchRepository: mockSearchRepo,
          resolveWorkspace: mockResolveWorkspace,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const longQ = 'a'.repeat(201);
      const res = await request(app).get(`/api/search?q=${longQ}`);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'BadRequest');
      assert.ok(res.body.message.includes('cannot exceed 200'));
    });

    it('rejects invalid type filter with 400', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        searchRouter: createSearchRouter({
          searchRepository: mockSearchRepo,
          resolveWorkspace: mockResolveWorkspace,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const res = await request(app).get('/api/search?q=test&type=invalid_type');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'BadRequest');
      assert.ok(res.body.message.includes('Invalid type filter'));
    });

    it('rejects invalid limit parameter with 400', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        searchRouter: createSearchRouter({
          searchRepository: mockSearchRepo,
          resolveWorkspace: mockResolveWorkspace,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const resNeg = await request(app).get('/api/search?q=test&limit=-5');
      assert.strictEqual(resNeg.status, 400);

      const resZero = await request(app).get('/api/search?q=test&limit=0');
      assert.strictEqual(resZero.status, 400);

      const resTooLarge = await request(app).get('/api/search?q=test&limit=100');
      assert.strictEqual(resTooLarge.status, 400);

      const resAlpha = await request(app).get('/api/search?q=test&limit=abc');
      assert.strictEqual(resAlpha.status, 400);
    });

    it('rejects invalid offset parameter with 400', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        searchRouter: createSearchRouter({
          searchRepository: mockSearchRepo,
          resolveWorkspace: mockResolveWorkspace,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const resNeg = await request(app).get('/api/search?q=test&offset=-1');
      assert.strictEqual(resNeg.status, 400);

      const resAlpha = await request(app).get('/api/search?q=test&offset=xyz');
      assert.strictEqual(resAlpha.status, 400);
    });
  });

  describe('Search Execution & Stable Response Contract', () => {
    it('returns stable response contract for type=all with mixed results', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        searchRouter: createSearchRouter({
          searchRepository: mockSearchRepo,
          resolveWorkspace: mockResolveWorkspace,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const res = await request(app).get('/api/search?q=React');
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers['cache-control'].includes('no-store'));

      assert.strictEqual(res.body.query, 'React');
      assert.strictEqual(res.body.workspaceId, WS_ID);
      assert.strictEqual(res.body.type, 'all');
      assert.strictEqual(res.body.total, 6);
      assert.strictEqual(res.body.limit, 20);
      assert.strictEqual(res.body.offset, 0);
      assert.strictEqual(res.body.hasMore, false);
      assert.strictEqual(Array.isArray(res.body.results), true);
      assert.strictEqual(res.body.results.length, 6);

      // Verify structure of first result
      const noteResult = res.body.results.find((r) => r.type === 'notes');
      assert.ok(noteResult);
      assert.strictEqual(noteResult.title, 'React Architecture Note');
      assert.strictEqual(noteResult.url, `/notes/${noteResult.id}`);
      assert.ok(Array.isArray(noteResult.badges));
      assert.ok(noteResult.updatedAt);
    });

    it('filters results when specific type is selected (e.g. type=tasks)', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        searchRouter: createSearchRouter({
          searchRepository: mockSearchRepo,
          resolveWorkspace: mockResolveWorkspace,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const res = await request(app).get('/api/search?q=React&type=tasks');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.type, 'tasks');
      assert.strictEqual(res.body.total, 1);
      assert.strictEqual(res.body.results.length, 1);
      assert.strictEqual(res.body.results[0].type, 'tasks');
      assert.strictEqual(res.body.results[0].url, '/tasks');
    });

    it('enforces pagination limit and offset correctly', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        searchRouter: createSearchRouter({
          searchRepository: mockSearchRepo,
          resolveWorkspace: mockResolveWorkspace,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      const res = await request(app).get('/api/search?q=React&limit=2&offset=2');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.limit, 2);
      assert.strictEqual(res.body.offset, 2);
      assert.strictEqual(res.body.results.length, 2);
      assert.strictEqual(res.body.hasMore, true);
    });

    it('enforces user and workspace isolation', async () => {
      const app = createApp({
        sessionMiddleware: fakeSession,
        searchRouter: createSearchRouter({
          searchRepository: mockSearchRepo,
          resolveWorkspace: async () => OTHER_WS_ID,
          requireAuthMiddleware: fakeAuth,
        }),
      });

      // Searching a different workspace returns 0 results
      const resOtherWs = await request(app).get('/api/search?q=React');
      assert.strictEqual(resOtherWs.status, 200);
      assert.strictEqual(resOtherWs.body.total, 0);
      assert.strictEqual(resOtherWs.body.results.length, 0);

      // Searching as a different user returns 0 results
      activeUser = { id: OTHER_USER_ID, email: 'other@example.com' };
      const resOtherUser = await request(app).get('/api/search?q=React');
      assert.strictEqual(resOtherUser.status, 200);
      assert.strictEqual(resOtherUser.body.total, 0);
      assert.strictEqual(resOtherUser.body.results.length, 0);
    });
  });
});
