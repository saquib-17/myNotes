import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createJournalRouter } from '../src/routes/journal.routes.js';
import {
  JOURNAL_LIMITS,
  validateEntryDate,
  validateJournalContent,
} from '../src/journal/journalRepository.js';

describe('Journal REST API & Repository Tests (Isolated Seams)', () => {
  let mockUsers;
  let mockJournalEntries;
  let app;
  let mockJournalRepo;

  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    mockUsers = new Map([
      [USER_A_ID, { id: USER_A_ID, email: 'usera@example.com' }],
      [USER_B_ID, { id: USER_B_ID, email: 'userb@example.com' }],
    ]);
    mockJournalEntries = new Map();

    let journalCounter = 1;

    mockJournalRepo = {
      JOURNAL_LIMITS,
      validateEntryDate,
      validateJournalContent,

      async findJournalEntriesByUserId({ userId, from, to, q, limit = 20, offset = 0 }) {
        let entries = Array.from(mockJournalEntries.values()).filter(
          (e) => e.userId === userId && e.deletedAt === null
        );

        if (from) {
          validateEntryDate(from, true);
          entries = entries.filter((e) => e.entryDate >= from);
        }

        if (to) {
          validateEntryDate(to, true);
          entries = entries.filter((e) => e.entryDate <= to);
        }

        if (q && q.trim()) {
          const lq = q.trim().toLowerCase();
          entries = entries.filter((e) => e.content.toLowerCase().includes(lq));
        }

        // Sort: entry_date DESC, id ASC
        entries.sort((a, b) => {
          if (b.entryDate !== a.entryDate) {
            return b.entryDate.localeCompare(a.entryDate);
          }
          return a.id.localeCompare(b.id);
        });

        const total = entries.length;
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
        const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);
        const paginated = entries.slice(parsedOffset, parsedOffset + parsedLimit);

        const mapped = paginated.map((e) => ({
          id: e.id,
          user_id: e.userId,
          entry_date: e.entryDate,
          content: e.content,
          created_at: e.createdAt.toISOString(),
          updated_at: e.updatedAt.toISOString(),
        }));

        return {
          entries: mapped,
          items: mapped,
          total,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: parsedOffset + paginated.length < total,
          has_more: parsedOffset + paginated.length < total,
        };
      },

      async findJournalEntryByDateAndUserId({ userId, entryDate }) {
        const validDate = validateEntryDate(entryDate, true);
        const entry = Array.from(mockJournalEntries.values()).find(
          (e) => e.userId === userId && e.entryDate === validDate && e.deletedAt === null
        );
        if (!entry) return null;
        return {
          id: entry.id,
          user_id: entry.userId,
          entry_date: entry.entryDate,
          content: entry.content,
          created_at: entry.createdAt.toISOString(),
          updated_at: entry.updatedAt.toISOString(),
        };
      },

      async upsertJournalEntry({ userId, entryDate, content }) {
        const validDate = validateEntryDate(entryDate, false);
        const validContent = validateJournalContent(content);

        const existing = Array.from(mockJournalEntries.values()).find(
          (e) => e.userId === userId && e.entryDate === validDate && e.deletedAt === null
        );

        const now = new Date();
        if (existing) {
          existing.content = validContent;
          existing.updatedAt = now;
          const mapped = {
            id: existing.id,
            user_id: existing.userId,
            entry_date: existing.entryDate,
            content: existing.content,
            created_at: existing.createdAt.toISOString(),
            updated_at: existing.updatedAt.toISOString(),
          };
          return {
            entry: mapped,
            created: false,
          };
        }

        const id = `00000000-0000-4000-8000-${String(journalCounter++).padStart(12, '0')}`;
        const record = {
          id,
          userId,
          entryDate: validDate,
          content: validContent,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        mockJournalEntries.set(id, record);
        const mapped = {
          id: record.id,
          user_id: record.userId,
          entry_date: record.entryDate,
          content: record.content,
          created_at: record.createdAt.toISOString(),
          updated_at: record.updatedAt.toISOString(),
        };
        return {
          entry: mapped,
          created: true,
        };
      },

      async softDeleteJournalEntry({ userId, entryDate }) {
        const validDate = validateEntryDate(entryDate, true);
        const entry = Array.from(mockJournalEntries.values()).find(
          (e) => e.userId === userId && e.entryDate === validDate && e.deletedAt === null
        );
        if (!entry) return false;
        entry.deletedAt = new Date();
        entry.updatedAt = new Date();
        return true;
      },
    };

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

    const sessionMiddleware = session({
      secret: 'test-journal-secret-must-be-long-enough-32-chars',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    });

    const mockAuthRouter = createAuthRouter({
      userRepository: {
        async findById(id) {
          return mockUsers.get(id) || null;
        },
      },
    });

    const journalRouter = createJournalRouter({
      journalRepository: mockJournalRepo,
      requireAuthMiddleware: mockRequireAuth,
    });

    app = createApp({
      sessionMiddleware,
      authRouter: mockAuthRouter,
      journalRouter,
    });
  });

  async function loginAs(userId) {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/auth/csrf');
    const csrfToken = csrfRes.body.csrfToken;
    return { agent, csrfToken, userId };
  }

  // 1. Validation Helpers
  describe('Repository Validation Helpers', () => {
    it('validates entry date constraints and rejects invalid calendar dates or future dates', () => {
      assert.throws(() => validateEntryDate('2026/10/25'), /YYYY-MM-DD format/);
      assert.throws(() => validateEntryDate('2026-02-31'), /valid calendar date/);
      assert.throws(() => validateEntryDate('2099-01-01', false), /cannot be in the future/);

      // Past date succeeds
      assert.equal(validateEntryDate('2026-01-15', false), '2026-01-15');
      // allowFuture = true allows querying past/future boundaries if needed
      assert.equal(validateEntryDate('2099-01-01', true), '2099-01-01');
    });

    it('validates journal content and enforces 20,000 char maximum', () => {
      assert.equal(validateJournalContent(null), '');
      assert.equal(validateJournalContent(undefined), '');
      assert.equal(validateJournalContent('Today was productive.'), 'Today was productive.');

      assert.throws(() => validateJournalContent(12345), /must be a string/);
      const oversized = 'a'.repeat(20001);
      assert.throws(() => validateJournalContent(oversized), /cannot exceed 20000 characters/);
    });
  });

  // 2. Authentication Enforcement
  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated requests to all endpoints with 401', async () => {
      const endpoints = [
        { method: 'get', url: '/api/journal' },
        { method: 'get', url: '/api/journal/2026-10-25' },
        { method: 'put', url: '/api/journal/2026-10-25' },
        { method: 'delete', url: '/api/journal/2026-10-25' },
      ];

      for (const { method, url } of endpoints) {
        const res = await request(app)[method](url);
        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'Unauthorized');
      }
    });
  });

  // 3. CSRF Protection
  describe('CSRF Protection on Mutations', () => {
    it('rejects PUT and DELETE when CSRF header is missing', async () => {
      const agent = request.agent(app);
      await agent.get('/api/auth/csrf');

      const putRes = await agent
        .put('/api/journal/2026-10-25')
        .set('x-test-user-id', USER_A_ID)
        .send({ content: 'Unprotected entry' });
      assert.equal(putRes.status, 403);

      const delRes = await agent
        .delete('/api/journal/2026-10-25')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(delRes.status, 403);
    });
  });

  // 4. PUT /api/journal/:date (Create & Update)
  describe('PUT /api/journal/:date', () => {
    it('creates an entry for a date when none exists and marks created: true', async () => {
      const { agent, csrfToken } = await loginAs(USER_A_ID);

      const res = await agent
        .put('/api/journal/2026-10-25')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'Reflected on system design principles.' });

      assert.equal(res.status, 200);
      assert.equal(res.body.entry_date, '2026-10-25');
      assert.equal(res.body.content, 'Reflected on system design principles.');
      assert.equal(res.body.created, true);
    });

    it('updates existing active entry for the same date and marks created: false', async () => {
      const { agent, csrfToken } = await loginAs(USER_A_ID);

      // First create
      await agent
        .put('/api/journal/2026-10-25')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'Initial reflection.' });

      // Second update
      const updateRes = await agent
        .put('/api/journal/2026-10-25')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'Updated reflection with more details.' });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.entry_date, '2026-10-25');
      assert.equal(updateRes.body.content, 'Updated reflection with more details.');
      assert.equal(updateRes.body.created, false);

      // Verify only 1 active record exists
      const listRes = await agent
        .get('/api/journal')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(listRes.body.total, 1);
    });

    it('rejects future dates and oversized content with 400', async () => {
      const { agent, csrfToken } = await loginAs(USER_A_ID);

      const futureRes = await agent
        .put('/api/journal/2099-01-01')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'Future thoughts.' });
      assert.equal(futureRes.status, 400);
      assert.match(futureRes.body.message, /cannot be in the future/i);

      const oversizedContent = 'X'.repeat(20001);
      const oversizedRes = await agent
        .put('/api/journal/2026-10-25')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: oversizedContent });
      assert.equal(oversizedRes.status, 400);
      assert.match(oversizedRes.body.message, /cannot exceed 20000 characters/i);
    });
  });

  // 5. GET /api/journal/:date
  describe('GET /api/journal/:date', () => {
    it('returns the active entry or 404 if missing', async () => {
      const { agent, csrfToken } = await loginAs(USER_A_ID);

      const missingRes = await agent
        .get('/api/journal/2026-10-20')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(missingRes.status, 404);

      await agent
        .put('/api/journal/2026-10-20')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'Day 20 notes.' });

      const foundRes = await agent
        .get('/api/journal/2026-10-20')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(foundRes.status, 200);
      assert.equal(foundRes.body.content, 'Day 20 notes.');
    });
  });

  // 6. GET /api/journal (Listing, Search & Date Range Filters)
  describe('GET /api/journal', () => {
    beforeEach(async () => {
      const { agent, csrfToken } = await loginAs(USER_A_ID);
      await agent
        .put('/api/journal/2026-10-21')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'Studied Dynamic Programming and graphs.' });
      await agent
        .put('/api/journal/2026-10-22')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'Prepared for behavioral interview questions.' });
      await agent
        .put('/api/journal/2026-10-23')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'Refactored backend service seams and migrations.' });
    });

    it('lists entries sorted by entry_date DESC with total and pagination', async () => {
      const { agent } = await loginAs(USER_A_ID);

      const res = await agent.get('/api/journal').set('x-test-user-id', USER_A_ID);
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 3);
      assert.equal(res.body.entries[0].entry_date, '2026-10-23');
      assert.equal(res.body.entries[1].entry_date, '2026-10-22');
      assert.equal(res.body.entries[2].entry_date, '2026-10-21');
    });

    it('filters entries by date range from and to', async () => {
      const { agent } = await loginAs(USER_A_ID);

      const res = await agent
        .get('/api/journal?from=2026-10-22&to=2026-10-23')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 2);
      assert.equal(res.body.entries[0].entry_date, '2026-10-23');
      assert.equal(res.body.entries[1].entry_date, '2026-10-22');
    });

    it('searches entries by keyword in content', async () => {
      const { agent } = await loginAs(USER_A_ID);

      const res = await agent
        .get('/api/journal?q=behavioral')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 1);
      assert.equal(res.body.entries[0].entry_date, '2026-10-22');
    });
  });

  // 7. Multi-Tenant Isolation
  describe('Multi-Tenant Isolation', () => {
    it('prevents users from seeing or modifying each others entries', async () => {
      const userA = await loginAs(USER_A_ID);
      const userB = await loginAs(USER_B_ID);

      await userA.agent
        .put('/api/journal/2026-10-25')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', userA.csrfToken)
        .send({ content: 'User A private journal.' });

      // User B cannot access User A's entry
      const getRes = await userB.agent
        .get('/api/journal/2026-10-25')
        .set('x-test-user-id', USER_B_ID);
      assert.equal(getRes.status, 404);

      // User B cannot delete User A's entry
      const delRes = await userB.agent
        .delete('/api/journal/2026-10-25')
        .set('x-test-user-id', USER_B_ID)
        .set('x-csrf-token', userB.csrfToken);
      assert.equal(delRes.status, 404);

      // User B's list is empty
      const listRes = await userB.agent
        .get('/api/journal')
        .set('x-test-user-id', USER_B_ID);
      assert.equal(listRes.body.total, 0);
    });
  });

  // 8. Soft Delete and Recreate Flow
  describe('Soft Delete and Recreate Flow', () => {
    it('soft deletes entry and allows creating a new entry for the same date without resurrecting the old one', async () => {
      const { agent, csrfToken } = await loginAs(USER_A_ID);

      // 1. Create entry
      await agent
        .put('/api/journal/2026-10-24')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'First reflection to be deleted.' });

      // 2. Soft-delete
      const delRes = await agent
        .delete('/api/journal/2026-10-24')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken);
      assert.equal(delRes.status, 204);

      // 3. Excluded from query
      const getRes = await agent
        .get('/api/journal/2026-10-24')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(getRes.status, 404);

      const listRes = await agent
        .get('/api/journal')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(listRes.body.total, 0);

      // 4. Recreate entry for the same date
      const recreateRes = await agent
        .put('/api/journal/2026-10-24')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ content: 'Brand new reflection for the same date.' });
      assert.equal(recreateRes.status, 200);
      assert.equal(recreateRes.body.created, true);
      assert.equal(recreateRes.body.content, 'Brand new reflection for the same date.');

      // 5. Verify single active entry in list
      const finalListRes = await agent
        .get('/api/journal')
        .set('x-test-user-id', USER_A_ID);
      assert.equal(finalListRes.body.total, 1);
      assert.equal(finalListRes.body.entries[0].content, 'Brand new reflection for the same date.');
    });
  });
});
