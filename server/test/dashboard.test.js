import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createDashboardRouter } from '../src/routes/dashboard.routes.js';

describe('Dashboard REST API & Repository Tests (Isolated Seams)', () => {
  let mockUsers;
  let mockData;
  let app;
  let mockDashboardRepo;

  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';
  const TODAY_STR = '2026-10-28';

  beforeEach(() => {
    mockUsers = new Map([
      [USER_A_ID, { id: USER_A_ID, email: 'usera@example.com', name: 'User A' }],
      [USER_B_ID, { id: USER_B_ID, email: 'userb@example.com', name: 'User B' }],
    ]);

    mockData = {
      notes: [
        { id: 'n1', userId: USER_A_ID, title: 'Note 1', pinned: true, deletedAt: null, updatedAt: '2026-10-28T05:00:00Z' },
        { id: 'n2', userId: USER_A_ID, title: 'Note 2', pinned: false, deletedAt: null, updatedAt: '2026-10-28T04:00:00Z' },
        { id: 'n3', userId: USER_A_ID, title: 'Note 3', pinned: false, deletedAt: new Date(), updatedAt: '2026-10-28T03:00:00Z' }, // Soft deleted
        { id: 'n4', userId: USER_B_ID, title: 'User B Note', pinned: true, deletedAt: null, updatedAt: '2026-10-28T05:00:00Z' }, // Other user
      ],
      tasks: [
        { id: 't1', userId: USER_A_ID, title: 'Task Due Today', status: 'pending', priority: 'high', dueDate: TODAY_STR, deletedAt: null, updatedAt: '2026-10-28T01:00:00Z' },
        { id: 't2', userId: USER_A_ID, title: 'Overdue Task', status: 'pending', priority: 'medium', dueDate: '2026-10-20', deletedAt: null, updatedAt: '2026-10-28T01:00:00Z' },
        { id: 't3', userId: USER_A_ID, title: 'Overdue Completed Task', status: 'completed', priority: 'high', dueDate: '2026-10-20', deletedAt: null, updatedAt: '2026-10-28T01:00:00Z' }, // Completed, not overdue
        { id: 't4', userId: USER_A_ID, title: 'Future Task', status: 'pending', priority: 'low', dueDate: '2026-11-01', deletedAt: null, updatedAt: '2026-10-28T01:00:00Z' },
        { id: 't5', userId: USER_A_ID, title: 'Soft Deleted Task', status: 'pending', priority: 'high', dueDate: TODAY_STR, deletedAt: new Date(), updatedAt: '2026-10-28T01:00:00Z' }, // Soft deleted
        { id: 't6', userId: USER_B_ID, title: 'User B Task', status: 'pending', priority: 'high', dueDate: TODAY_STR, deletedAt: null, updatedAt: '2026-10-28T01:00:00Z' }, // Other user
      ],
      doubts: [
        { id: 'd1', userId: USER_A_ID, question: 'Doubt 1', subject: 'Java', status: 'open', deletedAt: null, createdAt: '2026-10-28T02:00:00Z' },
        { id: 'd2', userId: USER_A_ID, question: 'Doubt 2 Resolved', subject: 'Java', status: 'resolved', deletedAt: null, createdAt: '2026-10-28T01:00:00Z' },
        { id: 'd3', userId: USER_A_ID, question: 'Soft Deleted Doubt', subject: 'Java', status: 'open', deletedAt: new Date(), createdAt: '2026-10-28T03:00:00Z' },
      ],
      revisionItems: [
        { id: 'r1', userId: USER_A_ID, title: 'Revision 1', subject: 'DSA', status: 'pending', deletedAt: null, updatedAt: '2026-10-28T02:00:00Z' },
        { id: 'r2', userId: USER_A_ID, title: 'Revision 2 Revised', subject: 'DSA', status: 'revised', deletedAt: null, updatedAt: '2026-10-28T01:00:00Z' },
      ],
      questions: [
        { id: 'q1', userId: USER_A_ID, type: 'SHORT_ANSWER', question: 'Question 1', topic: 'OS', difficulty: 'easy', status: 'unlearned', deletedAt: null, updatedAt: '2026-10-28T01:00:00Z' },
        { id: 'q2', userId: USER_A_ID, type: 'MCQ', question: 'Question 2', topic: 'OS', difficulty: 'medium', status: 'learning', deletedAt: null, updatedAt: '2026-10-28T02:00:00Z' },
        { id: 'q3', userId: USER_A_ID, type: 'CODING', question: 'Question 3', topic: 'DSA', difficulty: 'hard', status: 'mastered', deletedAt: null, updatedAt: '2026-10-28T03:00:00Z' },
      ],
      documents: [
        { id: 'doc1', userId: USER_A_ID, title: 'Doc 1 Favorite', url: 'https://example.com/1', category: 'article', topic: 'Tech', favorite: true, deletedAt: null, updatedAt: '2026-10-28T01:00:00Z' },
        { id: 'doc2', userId: USER_A_ID, title: 'Doc 2 Normal', url: 'https://example.com/2', category: 'pdf', topic: 'Tech', favorite: false, deletedAt: null, updatedAt: '2026-10-28T02:00:00Z' },
      ],
      journalEntries: [
        { id: 'j1', userId: USER_A_ID, entryDate: TODAY_STR, content: 'Today journal', deletedAt: null, updatedAt: '2026-10-28T04:00:00Z' },
        { id: 'j2', userId: USER_A_ID, entryDate: '2026-10-25', content: 'Past journal', deletedAt: null, updatedAt: '2026-10-25T04:00:00Z' },
      ],
    };

    mockDashboardRepo = {
      async getDashboardOverview({ userId, clientDate }) {
        const todayStr = clientDate || TODAY_STR;

        const activeNotes = mockData.notes.filter((n) => n.userId === userId && n.deletedAt === null);
        const pinnedNotes = activeNotes.filter((n) => n.pinned);

        const activeTasks = mockData.tasks.filter((t) => t.userId === userId && t.deletedAt === null);
        const pendingTasks = activeTasks.filter((t) => t.status === 'pending');
        const completedTasks = activeTasks.filter((t) => t.status === 'completed');

        const dueTasks = pendingTasks.filter((t) => t.dueDate === todayStr).slice(0, 5);
        const overdueTasks = pendingTasks.filter((t) => t.dueDate && t.dueDate < todayStr).slice(0, 5);

        const activeDoubts = mockData.doubts.filter((d) => d.userId === userId && d.deletedAt === null);
        const openDoubts = activeDoubts.filter((d) => d.status === 'open');

        const activeRevision = mockData.revisionItems.filter((r) => r.userId === userId && r.deletedAt === null);
        const pendingRevision = activeRevision.filter((r) => r.status === 'pending');

        const activeQuestions = mockData.questions.filter((q) => q.userId === userId && q.deletedAt === null);
        const learningQuestions = activeQuestions.filter((q) => q.status === 'learning');
        const masteredQuestions = activeQuestions.filter((q) => q.status === 'mastered');

        const activeDocs = mockData.documents.filter((d) => d.userId === userId && d.deletedAt === null);
        const favoriteDocs = activeDocs.filter((d) => d.favorite);

        const activeJournal = mockData.journalEntries.filter((j) => j.userId === userId && j.deletedAt === null);
        const journalSaved = activeJournal.some((j) => j.entryDate === todayStr);

        return {
          date: todayStr,
          stats: {
            activeNotes: activeNotes.length,
            pinnedNotes: pinnedNotes.length,
            pendingTasks: pendingTasks.length,
            completedTasks: completedTasks.length,
            openDoubts: openDoubts.length,
            pendingRevisionItems: pendingRevision.length,
            totalQuestions: activeQuestions.length,
            learningQuestions: learningQuestions.length,
            masteredQuestions: masteredQuestions.length,
            favoriteDocuments: favoriteDocs.length,
            journalEntries: activeJournal.length,
          },
          today: {
            journalSaved,
            dueTasks: dueTasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority, due_date: t.dueDate, updated_at: t.updatedAt })),
            overdueTasks: overdueTasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority, due_date: t.dueDate, updated_at: t.updatedAt })),
          },
          focus: {
            tasks: pendingTasks.slice(0, 5).map((t) => ({ id: t.id, title: t.title, priority: t.priority, due_date: t.dueDate, updated_at: t.updatedAt })),
            doubts: openDoubts.slice(0, 5).map((d) => ({ id: d.id, question: d.question, subject: d.subject, created_at: d.createdAt, updated_at: d.createdAt })),
            revisionItems: pendingRevision.slice(0, 5).map((r) => ({ id: r.id, title: r.title, subject: r.subject, updated_at: r.updatedAt })),
          },
          recent: {
            notes: activeNotes.slice(0, 5).map((n) => ({ id: n.id, title: n.title, pinned: n.pinned, updated_at: n.updatedAt })),
            questions: activeQuestions.slice(0, 5).map((q) => ({ id: q.id, type: q.type, question: q.question, topic: q.topic, difficulty: q.difficulty, status: q.status, updated_at: q.updatedAt })),
            documents: activeDocs.slice(0, 5).map((d) => ({ id: d.id, title: d.title, url: d.url, category: d.category, topic: d.topic, favorite: d.favorite, updated_at: d.updatedAt })),
          },
        };
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
      secret: 'test-dashboard-secret-must-be-long-enough-32-chars',
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

    const dashboardRouter = createDashboardRouter({
      dashboardRepository: mockDashboardRepo,
      requireAuthMiddleware: mockRequireAuth,
    });

    app = createApp({
      sessionMiddleware,
      authRouter: mockAuthRouter,
      dashboardRouter,
    });
  });

  // 1. Authentication Enforcement
  it('rejects unauthenticated requests to GET /api/dashboard with 401', async () => {
    const res = await request(app).get('/api/dashboard');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Unauthorized');
  });

  // 2. Returns correct stats counts and user information
  it('returns aggregated stats counts, user info, and today date', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('x-test-user-id', USER_A_ID);

    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'usera@example.com');
    assert.equal(res.body.user.name, 'User A');
    assert.equal(res.body.date, TODAY_STR);

    // Verify stats
    assert.equal(res.body.stats.activeNotes, 2); // 3 total, 1 soft-deleted
    assert.equal(res.body.stats.pinnedNotes, 1);
    assert.equal(res.body.stats.pendingTasks, 3); // t1 (today), t2 (overdue), t4 (future)
    assert.equal(res.body.stats.completedTasks, 1); // t3
    assert.equal(res.body.stats.openDoubts, 1); // d1 (d2 resolved, d3 soft-deleted)
    assert.equal(res.body.stats.pendingRevisionItems, 1); // r1 (r2 revised)
    assert.equal(res.body.stats.totalQuestions, 3);
    assert.equal(res.body.stats.learningQuestions, 1);
    assert.equal(res.body.stats.masteredQuestions, 1);
    assert.equal(res.body.stats.favoriteDocuments, 1);
    assert.equal(res.body.stats.journalEntries, 2);
  });

  // 3. Today Section: Due & Overdue Tasks & Journal Saved
  it('correctly categorizes due today and overdue tasks, ignoring completed tasks', async () => {
    const res = await request(app)
      .get(`/api/dashboard?date=${TODAY_STR}`)
      .set('x-test-user-id', USER_A_ID);

    assert.equal(res.status, 200);
    assert.equal(res.body.today.journalSaved, true);

    // Due today tasks
    assert.equal(res.body.today.dueTasks.length, 1);
    assert.equal(res.body.today.dueTasks[0].id, 't1');

    // Overdue tasks (must NOT include completed t3)
    assert.equal(res.body.today.overdueTasks.length, 1);
    assert.equal(res.body.today.overdueTasks[0].id, 't2');
  });

  // 4. Focus and Recent Lists Limit to 5
  it('limits focus and recent lists to a maximum of 5 items', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('x-test-user-id', USER_A_ID);

    assert.equal(res.status, 200);
    assert.ok(res.body.focus.tasks.length <= 5);
    assert.ok(res.body.focus.doubts.length <= 5);
    assert.ok(res.body.focus.revisionItems.length <= 5);
    assert.ok(res.body.recent.notes.length <= 5);
    assert.ok(res.body.recent.questions.length <= 5);
    assert.ok(res.body.recent.documents.length <= 5);
  });

  // 5. Tenant Isolation
  it('strictly isolates dashboard data between users', async () => {
    const resA = await request(app)
      .get('/api/dashboard')
      .set('x-test-user-id', USER_A_ID);

    const resB = await request(app)
      .get('/api/dashboard')
      .set('x-test-user-id', USER_B_ID);

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);

    assert.equal(resA.body.stats.activeNotes, 2);
    assert.equal(resB.body.stats.activeNotes, 1);
    assert.equal(resB.body.stats.pinnedNotes, 1);
    assert.equal(resB.body.stats.journalEntries, 0);
    assert.equal(resB.body.today.journalSaved, false);
  });
});
