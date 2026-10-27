import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createRevisionItemsRouter } from '../src/routes/revisionItems.routes.js';
import { createDoubtsRouter } from '../src/routes/doubts.routes.js';
import {
  REVISION_ITEM_LIMITS,
  validateAndNormalizeTitle,
  validateAndNormalizeDetails as validateRevisionDetails,
  validateAndNormalizeSubject as validateRevisionSubject,
  validateRevisionStatus,
} from '../src/revision/revisionItemRepository.js';
import {
  DOUBT_LIMITS,
  validateAndNormalizeQuestion,
  validateAndNormalizeDetails as validateDoubtDetails,
  validateAndNormalizeResolution,
  validateAndNormalizeSubject as validateDoubtSubject,
  validateDoubtStatus,
} from '../src/doubts/doubtRepository.js';

describe('Revision & Doubts REST API & Repository Tests (Isolated Seams)', () => {
  let mockUsers;
  let mockRevisionItems;
  let mockDoubts;
  let app;
  let mockRevisionRepo;
  let mockDoubtRepo;

  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    mockUsers = new Map([
      [USER_A_ID, { id: USER_A_ID, email: 'usera@example.com' }],
      [USER_B_ID, { id: USER_B_ID, email: 'userb@example.com' }],
    ]);
    mockRevisionItems = new Map();
    mockDoubts = new Map();

    let revisionCounter = 1;
    let doubtCounter = 1;

    mockRevisionRepo = {
      REVISION_ITEM_LIMITS,
      validateAndNormalizeTitle,
      validateAndNormalizeDetails: validateRevisionDetails,
      validateAndNormalizeSubject: validateRevisionSubject,
      validateRevisionStatus,

      async createRevisionItem({ userId, title, details = null, subject = null, status = 'pending' }) {
        const id = `00000000-0000-4000-8000-${String(revisionCounter++).padStart(12, '0')}`;
        const now = new Date();
        const normStatus = validateRevisionStatus(status);
        const record = {
          id,
          userId,
          title: validateAndNormalizeTitle(title),
          details: validateRevisionDetails(details),
          subject: validateRevisionSubject(subject),
          status: normStatus,
          revisedAt: normStatus === 'revised' ? now : null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        mockRevisionItems.set(id, record);
        return {
          ...record,
          revisedAt: record.revisedAt ? record.revisedAt.toISOString() : null,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        };
      },

      async findRevisionItemsByUserId({ userId, status, subject, q = '', limit = 20, offset = 0 }) {
        let items = Array.from(mockRevisionItems.values()).filter(
          (r) => r.userId === userId && r.deletedAt === null
        );

        if (status) {
          items = items.filter((r) => r.status === status.toLowerCase());
        }

        if (subject && subject.trim()) {
          items = items.filter((r) => r.subject && r.subject.toLowerCase() === subject.trim().toLowerCase());
        }

        if (q && q.trim()) {
          const lq = q.trim().toLowerCase();
          items = items.filter(
            (r) =>
              (r.title && r.title.toLowerCase().includes(lq)) ||
              (r.details && r.details.toLowerCase().includes(lq)) ||
              (r.subject && r.subject.toLowerCase().includes(lq))
          );
        }

        items.sort((a, b) => {
          if (a.status !== b.status) {
            return a.status === 'pending' ? -1 : 1;
          }
          const t = b.updatedAt.getTime() - a.updatedAt.getTime();
          if (t !== 0) return t;
          return a.id.localeCompare(b.id);
        });

        const total = items.length;
        const sliced = items.slice(offset, offset + limit);
        const hasMore = offset + limit < total;

        const mapped = sliced.map((r) => ({
          ...r,
          revisedAt: r.revisedAt ? r.revisedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }));

        return {
          revisionItems: mapped,
          items: mapped,
          rawItems: mapped,
          total,
          limit,
          offset,
          hasMore,
        };
      },

      async findRevisionItemByIdAndUserId({ id, userId }) {
        const r = mockRevisionItems.get(id);
        if (!r || r.userId !== userId || r.deletedAt !== null) return null;
        return {
          ...r,
          revisedAt: r.revisedAt ? r.revisedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        };
      },

      async updateRevisionItem({ id, userId, title, details, subject, status }) {
        const r = mockRevisionItems.get(id);
        if (!r || r.userId !== userId || r.deletedAt !== null) return null;

        if (title !== undefined) r.title = validateAndNormalizeTitle(title);
        if (details !== undefined) r.details = validateRevisionDetails(details);
        if (subject !== undefined) r.subject = validateRevisionSubject(subject);
        if (status !== undefined) {
          const normStatus = validateRevisionStatus(status);
          if (normStatus === 'revised' && r.status !== 'revised') {
            r.revisedAt = new Date();
          } else if (normStatus === 'pending') {
            r.revisedAt = null;
          }
          r.status = normStatus;
        }

        r.updatedAt = new Date();
        return {
          ...r,
          revisedAt: r.revisedAt ? r.revisedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        };
      },

      async setRevisionItemStatus({ id, userId, status }) {
        const r = mockRevisionItems.get(id);
        if (!r || r.userId !== userId || r.deletedAt !== null) return null;

        const normStatus = validateRevisionStatus(status);
        r.status = normStatus;
        r.revisedAt = normStatus === 'revised' ? new Date() : null;
        r.updatedAt = new Date();

        return {
          ...r,
          revisedAt: r.revisedAt ? r.revisedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        };
      },

      async softDeleteRevisionItem({ id, userId }) {
        const r = mockRevisionItems.get(id);
        if (!r || r.userId !== userId || r.deletedAt !== null) return false;
        r.deletedAt = new Date();
        r.updatedAt = new Date();
        return true;
      },
    };

    mockDoubtRepo = {
      DOUBT_LIMITS,
      validateAndNormalizeQuestion,
      validateAndNormalizeDetails: validateDoubtDetails,
      validateAndNormalizeResolution,
      validateAndNormalizeSubject: validateDoubtSubject,
      validateDoubtStatus,

      async createDoubt({ userId, question, details = null, subject = null, status = 'open', resolution = null }) {
        const id = `00000000-0000-4000-8000-${String(doubtCounter++).padStart(12, '0')}`;
        const now = new Date();
        const normStatus = validateDoubtStatus(status);
        const record = {
          id,
          userId,
          question: validateAndNormalizeQuestion(question),
          details: validateDoubtDetails(details),
          subject: validateDoubtSubject(subject),
          status: normStatus,
          resolution: validateAndNormalizeResolution(resolution),
          resolvedAt: normStatus === 'resolved' ? now : null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        mockDoubts.set(id, record);
        return {
          ...record,
          resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : null,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        };
      },

      async findDoubtsByUserId({ userId, status, subject, q = '', limit = 20, offset = 0 }) {
        let items = Array.from(mockDoubts.values()).filter(
          (d) => d.userId === userId && d.deletedAt === null
        );

        if (status) {
          items = items.filter((d) => d.status === status.toLowerCase());
        }

        if (subject && subject.trim()) {
          items = items.filter((d) => d.subject && d.subject.toLowerCase() === subject.trim().toLowerCase());
        }

        if (q && q.trim()) {
          const lq = q.trim().toLowerCase();
          items = items.filter(
            (d) =>
              (d.question && d.question.toLowerCase().includes(lq)) ||
              (d.details && d.details.toLowerCase().includes(lq)) ||
              (d.subject && d.subject.toLowerCase().includes(lq)) ||
              (d.resolution && d.resolution.toLowerCase().includes(lq))
          );
        }

        items.sort((a, b) => {
          if (a.status !== b.status) {
            return a.status === 'open' ? -1 : 1;
          }
          const t = b.updatedAt.getTime() - a.updatedAt.getTime();
          if (t !== 0) return t;
          return a.id.localeCompare(b.id);
        });

        const total = items.length;
        const sliced = items.slice(offset, offset + limit);
        const hasMore = offset + limit < total;

        const mapped = sliced.map((d) => ({
          ...d,
          resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        }));

        return {
          doubts: mapped,
          items: mapped,
          rawItems: mapped,
          total,
          limit,
          offset,
          hasMore,
        };
      },

      async findDoubtByIdAndUserId({ id, userId }) {
        const d = mockDoubts.get(id);
        if (!d || d.userId !== userId || d.deletedAt !== null) return null;
        return {
          ...d,
          resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        };
      },

      async updateDoubt({ id, userId, question, details, subject, status, resolution }) {
        const d = mockDoubts.get(id);
        if (!d || d.userId !== userId || d.deletedAt !== null) return null;

        if (question !== undefined) d.question = validateAndNormalizeQuestion(question);
        if (details !== undefined) d.details = validateDoubtDetails(details);
        if (subject !== undefined) d.subject = validateDoubtSubject(subject);
        if (resolution !== undefined) d.resolution = validateAndNormalizeResolution(resolution);
        if (status !== undefined) {
          const normStatus = validateDoubtStatus(status);
          if (normStatus === 'resolved' && d.status !== 'resolved') {
            d.resolvedAt = new Date();
          } else if (normStatus === 'open') {
            d.resolvedAt = null;
          }
          d.status = normStatus;
        }

        d.updatedAt = new Date();
        return {
          ...d,
          resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        };
      },

      async setDoubtStatus({ id, userId, status, resolution }) {
        const d = mockDoubts.get(id);
        if (!d || d.userId !== userId || d.deletedAt !== null) return null;

        const normStatus = validateDoubtStatus(status);
        d.status = normStatus;
        if (normStatus === 'resolved') {
          d.resolvedAt = new Date();
          if (resolution !== undefined) {
            d.resolution = validateAndNormalizeResolution(resolution);
          }
        } else {
          d.resolvedAt = null;
          if (resolution !== undefined) {
            d.resolution = validateAndNormalizeResolution(resolution);
          }
        }
        d.updatedAt = new Date();

        return {
          ...d,
          resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        };
      },

      async softDeleteDoubt({ id, userId }) {
        const d = mockDoubts.get(id);
        if (!d || d.userId !== userId || d.deletedAt !== null) return false;
        d.deletedAt = new Date();
        d.updatedAt = new Date();
        return true;
      },
    };

    const sessionMiddleware = session({
      secret: 'rev-doubts-test-session-secret-at-least-32-chars-long',
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
      authRepository: {
        async findUserById(id) {
          return mockUsers.get(id) || null;
        },
        async findUserByEmail(email) {
          for (const u of mockUsers.values()) {
            if (u.email === email) return u;
          }
          return null;
        },
      },
      requireAuthMiddleware: mockRequireAuth,
    });

    const revisionItemsRouter = createRevisionItemsRouter({
      revisionItemRepository: mockRevisionRepo,
      requireAuthMiddleware: mockRequireAuth,
    });

    const doubtsRouter = createDoubtsRouter({
      doubtRepository: mockDoubtRepo,
      requireAuthMiddleware: mockRequireAuth,
    });

    app = createApp({
      sessionMiddleware,
      authRouter,
      revisionItemsRouter,
      doubtsRouter,
    });
  });

  async function getCsrfAndCookie(agent) {
    const res = await agent.get('/api/auth/csrf');
    return {
      csrfToken: res.body.csrfToken,
      cookie: res.headers['set-cookie'],
    };
  }

  describe('Repository Validation Unit Tests', () => {
    it('validates revision item title constraints', () => {
      assert.throws(() => validateAndNormalizeTitle(null), /must be a string/);
      assert.throws(() => validateAndNormalizeTitle('   '), /cannot be empty/);
      assert.throws(() => validateAndNormalizeTitle('a'.repeat(201)), /cannot exceed 200/);
      assert.equal(validateAndNormalizeTitle('  OS Virtual Memory  '), 'OS Virtual Memory');
    });

    it('validates revision item details and subject constraints', () => {
      assert.equal(validateRevisionDetails(null), null);
      assert.equal(validateRevisionDetails('   '), null);
      assert.throws(() => validateRevisionDetails(123), /must be a string/);
      assert.throws(() => validateRevisionDetails('d'.repeat(5001)), /cannot exceed 5000/);

      assert.equal(validateRevisionSubject(null), null);
      assert.equal(validateRevisionSubject('   '), null);
      assert.throws(() => validateRevisionSubject(123), /must be a string/);
      assert.throws(() => validateRevisionSubject('s'.repeat(81)), /cannot exceed 80/);
    });

    it('validates revision status values', () => {
      assert.equal(validateRevisionStatus(undefined), 'pending');
      assert.equal(validateRevisionStatus(null), 'pending');
      assert.equal(validateRevisionStatus('revised'), 'revised');
      assert.throws(() => validateRevisionStatus('done'), /Invalid status/);
    });

    it('validates doubt question constraints', () => {
      assert.throws(() => validateAndNormalizeQuestion(null), /must be a string/);
      assert.throws(() => validateAndNormalizeQuestion('   '), /cannot be empty/);
      assert.throws(() => validateAndNormalizeQuestion('q'.repeat(1001)), /cannot exceed 1000/);
      assert.equal(validateAndNormalizeQuestion('  Why is Dijkstra greedy?  '), 'Why is Dijkstra greedy?');
    });

    it('validates doubt resolution, details, subject, and status constraints', () => {
      assert.equal(validateAndNormalizeResolution(null), null);
      assert.throws(() => validateAndNormalizeResolution('r'.repeat(5001)), /cannot exceed 5000/);
      assert.equal(validateDoubtStatus('open'), 'open');
      assert.equal(validateDoubtStatus('resolved'), 'resolved');
      assert.throws(() => validateDoubtStatus('closed'), /Invalid status/);
    });
  });

  describe('Authentication and CSRF Enforcement', () => {
    it('rejects unauthenticated requests to revision items and doubts with 401', async () => {
      const unauth = request(app);

      await unauth.get('/api/revision-items').expect(401);
      await unauth.post('/api/revision-items').send({ title: 'Topic' }).expect(401);
      await unauth.get('/api/doubts').expect(401);
      await unauth.post('/api/doubts').send({ question: 'Why?' }).expect(401);
    });

    it('rejects mutating requests without CSRF token with 403', async () => {
      const agent = request.agent(app);
      const fakeUuid = '00000000-0000-4000-8000-000000000001';

      await agent
        .post('/api/revision-items')
        .set('x-test-user-id', USER_A_ID)
        .send({ title: 'Topic' })
        .expect(403);

      await agent
        .post(`/api/revision-items/${fakeUuid}/revise`)
        .set('x-test-user-id', USER_A_ID)
        .expect(403);

      await agent
        .post('/api/doubts')
        .set('x-test-user-id', USER_A_ID)
        .send({ question: 'Why?' })
        .expect(403);

      await agent
        .post(`/api/doubts/${fakeUuid}/resolve`)
        .set('x-test-user-id', USER_A_ID)
        .expect(403);
    });
  });

  describe('Revision Items Workflows', () => {
    it('creates, lists, filters, revises, reopens, edits, and soft-deletes a revision item', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      // 1. Create
      const createRes = await agent
        .post('/api/revision-items')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'TCP 3-Way Handshake',
          details: 'SYN, SYN-ACK, ACK and sequence number synchronization',
          subject: 'Computer Networks',
        })
        .expect(201);

      assert.equal(createRes.body.title, 'TCP 3-Way Handshake');
      assert.equal(createRes.body.status, 'pending');
      assert.equal(createRes.body.revisedAt, null);
      const itemId = createRes.body.id;

      // 2. List & Filter
      const listRes = await agent
        .get('/api/revision-items?status=pending&subject=Computer Networks')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);

      assert.equal(listRes.body.total, 1);
      assert.equal(listRes.body.revisionItems[0].id, itemId);

      // 3. Mark as revised
      const reviseRes = await agent
        .post(`/api/revision-items/${itemId}/revise`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      assert.equal(reviseRes.body.status, 'revised');
      assert.ok(reviseRes.body.revisedAt);

      // 4. Reopen
      const reopenRes = await agent
        .post(`/api/revision-items/${itemId}/reopen`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      assert.equal(reopenRes.body.status, 'pending');
      assert.equal(reopenRes.body.revisedAt, null);

      // 5. Edit via PATCH
      const patchRes = await agent
        .patch(`/api/revision-items/${itemId}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'TCP Handshake & Teardown',
          status: 'revised',
        })
        .expect(200);

      assert.equal(patchRes.body.title, 'TCP Handshake & Teardown');
      assert.equal(patchRes.body.status, 'revised');
      assert.ok(patchRes.body.revisedAt);

      // 6. Soft delete
      await agent
        .delete(`/api/revision-items/${itemId}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .expect(204);

      // Verify exclusion
      const afterDel = await agent
        .get('/api/revision-items')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);
      assert.equal(afterDel.body.total, 0);
    });

    it('enforces tenant isolation on revision items', async () => {
      const agentA = request.agent(app);
      const agentB = request.agent(app);
      const { csrfToken: csrfA } = await getCsrfAndCookie(agentA);
      const { csrfToken: csrfB } = await getCsrfAndCookie(agentB);

      const created = await agentA
        .post('/api/revision-items')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfA)
        .send({ title: 'User A Secret Topic' })
        .expect(201);

      const itemId = created.body.id;

      // User B cannot view, patch, revise, or delete
      await agentB.get(`/api/revision-items/${itemId}`).set('x-test-user-id', USER_B_ID).expect(404);
      await agentB.patch(`/api/revision-items/${itemId}`).set('x-test-user-id', USER_B_ID).set('x-csrf-token', csrfB).send({ title: 'Hacked' }).expect(404);
      await agentB.post(`/api/revision-items/${itemId}/revise`).set('x-test-user-id', USER_B_ID).set('x-csrf-token', csrfB).expect(404);
      await agentB.delete(`/api/revision-items/${itemId}`).set('x-test-user-id', USER_B_ID).set('x-csrf-token', csrfB).expect(404);
    });
  });

  describe('Doubts Workflows', () => {
    it('creates, lists, resolves with resolution notes, reopens, edits, and soft-deletes a doubt', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      // 1. Create doubt
      const createRes = await agent
        .post('/api/doubts')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          question: 'Why does bellman-ford run V-1 times?',
          details: 'In a graph of V vertices, the longest simple shortest path has at most V-1 edges.',
          subject: 'Graph Algorithms',
        })
        .expect(201);

      assert.equal(createRes.body.question, 'Why does bellman-ford run V-1 times?');
      assert.equal(createRes.body.status, 'open');
      assert.equal(createRes.body.resolvedAt, null);
      const doubtId = createRes.body.id;

      // 2. List & Search
      const searchRes = await agent
        .get('/api/doubts?q=bellman-ford')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);

      assert.equal(searchRes.body.total, 1);
      assert.equal(searchRes.body.doubts[0].id, doubtId);

      // 3. Resolve doubt with resolution text
      const resolveRes = await agent
        .post(`/api/doubts/${doubtId}/resolve`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ resolution: 'Because each edge relaxation propagates distance by at least 1 edge.' })
        .expect(200);

      assert.equal(resolveRes.body.status, 'resolved');
      assert.ok(resolveRes.body.resolvedAt);
      assert.equal(resolveRes.body.resolution, 'Because each edge relaxation propagates distance by at least 1 edge.');

      // 4. Reopen doubt (preserves resolution notes while clearing resolvedAt)
      const reopenRes = await agent
        .post(`/api/doubts/${doubtId}/reopen`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      assert.equal(reopenRes.body.status, 'open');
      assert.equal(reopenRes.body.resolvedAt, null);
      assert.equal(reopenRes.body.resolution, 'Because each edge relaxation propagates distance by at least 1 edge.');

      // 5. Edit doubt
      const patchRes = await agent
        .patch(`/api/doubts/${doubtId}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          subject: 'Advanced Graphs',
        })
        .expect(200);

      assert.equal(patchRes.body.subject, 'Advanced Graphs');

      // 6. Soft delete
      await agent
        .delete(`/api/doubts/${doubtId}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .expect(204);

      // Verify exclusion
      const afterDel = await agent
        .get('/api/doubts')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);
      assert.equal(afterDel.body.total, 0);
    });

    it('enforces tenant isolation on doubts', async () => {
      const agentA = request.agent(app);
      const agentB = request.agent(app);
      const { csrfToken: csrfA } = await getCsrfAndCookie(agentA);
      const { csrfToken: csrfB } = await getCsrfAndCookie(agentB);

      const created = await agentA
        .post('/api/doubts')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfA)
        .send({ question: 'User A Secret Doubt' })
        .expect(201);

      const doubtId = created.body.id;

      // User B cannot view, patch, resolve, or delete
      await agentB.get(`/api/doubts/${doubtId}`).set('x-test-user-id', USER_B_ID).expect(404);
      await agentB.patch(`/api/doubts/${doubtId}`).set('x-test-user-id', USER_B_ID).set('x-csrf-token', csrfB).send({ question: 'Hacked' }).expect(404);
      await agentB.post(`/api/doubts/${doubtId}/resolve`).set('x-test-user-id', USER_B_ID).set('x-csrf-token', csrfB).expect(404);
      await agentB.delete(`/api/doubts/${doubtId}`).set('x-test-user-id', USER_B_ID).set('x-csrf-token', csrfB).expect(404);
    });
  });
});

