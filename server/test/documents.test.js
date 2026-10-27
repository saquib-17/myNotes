import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createDocumentsRouter } from '../src/routes/documents.routes.js';
import {
  DOCUMENT_LIMITS,
  validateAndNormalizeTitle,
  validateAndNormalizeUrl,
  validateAndNormalizeDescription,
  validateAndNormalizeTopic,
  validateCategory,
  validateFavorite,
} from '../src/documents/documentRepository.js';

describe('Document Library REST API & Repository Tests (Isolated Seams)', () => {
  let mockUsers;
  let mockDocuments;
  let app;
  let mockDocRepo;

  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    mockUsers = new Map([
      [USER_A_ID, { id: USER_A_ID, email: 'usera@example.com' }],
      [USER_B_ID, { id: USER_B_ID, email: 'userb@example.com' }],
    ]);
    mockDocuments = new Map();

    let docIdCounter = 1;

    mockDocRepo = {
      DOCUMENT_LIMITS,
      validateAndNormalizeTitle,
      validateAndNormalizeUrl,
      validateAndNormalizeDescription,
      validateAndNormalizeTopic,
      validateCategory,
      validateFavorite,

      async createDocument({
        userId,
        title,
        url,
        description = null,
        category = 'other',
        topic = null,
        favorite = false,
      }) {
        const normalizedTitle = validateAndNormalizeTitle(title);
        const normalizedUrl = validateAndNormalizeUrl(url);
        const normalizedDescription = validateAndNormalizeDescription(description);
        const normalizedCategory = validateCategory(category);
        const normalizedTopic = validateAndNormalizeTopic(topic);
        const normalizedFavorite = validateFavorite(favorite);

        const id = `00000000-0000-4000-8000-${String(docIdCounter++).padStart(12, '0')}`;
        const now = new Date();
        const record = {
          id,
          userId,
          title: normalizedTitle,
          url: normalizedUrl,
          description: normalizedDescription,
          category: normalizedCategory,
          topic: normalizedTopic,
          favorite: normalizedFavorite,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

        mockDocuments.set(id, record);
        return {
          id: record.id,
          title: record.title,
          url: record.url,
          description: record.description,
          category: record.category,
          topic: record.topic,
          favorite: record.favorite,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        };
      },

      async findDocumentsByUserId({
        userId,
        category,
        topic,
        favorite,
        q = '',
        limit = 20,
        offset = 0,
      }) {
        const allActive = Array.from(mockDocuments.values()).filter(
          (d) => d.userId === userId && d.deletedAt === null
        );

        let filtered = allActive;

        if (category && DOCUMENT_LIMITS.ALLOWED_CATEGORIES.includes(category.toLowerCase())) {
          filtered = filtered.filter((d) => d.category === category.toLowerCase());
        }

        if (topic && typeof topic === 'string') {
          filtered = filtered.filter(
            (d) => d.topic && d.topic.toLowerCase() === topic.toLowerCase()
          );
        }

        if (favorite !== undefined && favorite !== null) {
          if (favorite === true || favorite === 'true') {
            filtered = filtered.filter((d) => d.favorite === true);
          } else if (favorite === false || favorite === 'false') {
            filtered = filtered.filter((d) => d.favorite === false);
          }
        }

        if (q && typeof q === 'string' && q.trim().length > 0) {
          const lowerQ = q.trim().toLowerCase();
          filtered = filtered.filter(
            (d) =>
              (d.title && d.title.toLowerCase().includes(lowerQ)) ||
              (d.description && d.description.toLowerCase().includes(lowerQ)) ||
              (d.url && d.url.toLowerCase().includes(lowerQ)) ||
              (d.topic && d.topic.toLowerCase().includes(lowerQ))
          );
        }

        // Sort: favorite DESC, updatedAt DESC, id ASC
        filtered.sort((a, b) => {
          if (a.favorite !== b.favorite) {
            return a.favorite ? -1 : 1;
          }
          const timeDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
          if (timeDiff !== 0) return timeDiff;
          return a.id.localeCompare(b.id);
        });

        const total = filtered.length;
        const sliced = filtered.slice(offset, offset + limit);
        const hasMore = offset + limit < total;

        const items = sliced.map((d) => ({
          id: d.id,
          title: d.title,
          url: d.url,
          description: d.description,
          category: d.category,
          topic: d.topic,
          favorite: d.favorite,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        }));

        return {
          documents: items,
          items,
          rawItems: items,
          total,
          limit,
          offset,
          hasMore,
        };
      },

      async findDocumentByIdAndUserId({ id, userId }) {
        const d = mockDocuments.get(id);
        if (!d || d.userId !== userId || d.deletedAt !== null) {
          return null;
        }
        return {
          id: d.id,
          title: d.title,
          url: d.url,
          description: d.description,
          category: d.category,
          topic: d.topic,
          favorite: d.favorite,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        };
      },

      async updateDocument({ id, userId, title, url, description, category, topic, favorite }) {
        const d = mockDocuments.get(id);
        if (!d || d.userId !== userId || d.deletedAt !== null) {
          return null;
        }

        if (title !== undefined) {
          d.title = validateAndNormalizeTitle(title);
        }
        if (url !== undefined) {
          d.url = validateAndNormalizeUrl(url);
        }
        if (description !== undefined) {
          d.description = validateAndNormalizeDescription(description);
        }
        if (category !== undefined) {
          d.category = validateCategory(category);
        }
        if (topic !== undefined) {
          d.topic = validateAndNormalizeTopic(topic);
        }
        if (favorite !== undefined) {
          d.favorite = validateFavorite(favorite);
        }

        d.updatedAt = new Date();
        return {
          id: d.id,
          title: d.title,
          url: d.url,
          description: d.description,
          category: d.category,
          topic: d.topic,
          favorite: d.favorite,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        };
      },

      async setDocumentFavorite({ id, userId, favorite }) {
        const d = mockDocuments.get(id);
        if (!d || d.userId !== userId || d.deletedAt !== null) {
          return null;
        }
        d.favorite = validateFavorite(favorite);
        d.updatedAt = new Date();
        return {
          id: d.id,
          title: d.title,
          url: d.url,
          description: d.description,
          category: d.category,
          topic: d.topic,
          favorite: d.favorite,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        };
      },

      async softDeleteDocument({ id, userId }) {
        const d = mockDocuments.get(id);
        if (!d || d.userId !== userId || d.deletedAt !== null) {
          return false;
        }
        d.deletedAt = new Date();
        d.updatedAt = new Date();
        return true;
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
      secret: 'documents-test-session-secret-at-least-32-chars-long',
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

    const documentsRouter = createDocumentsRouter({
      documentRepository: mockDocRepo,
      requireAuthMiddleware: mockRequireAuth,
    });

    app = createApp({
      sessionMiddleware: testSessionMiddleware,
      authRouter,
      documentsRouter,
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
    it('validates and normalizes title correctly', () => {
      assert.throws(() => validateAndNormalizeTitle(null), /must be a string/);
      assert.throws(() => validateAndNormalizeTitle('   '), /cannot be empty/);
      assert.throws(() => validateAndNormalizeTitle('a'.repeat(201)), /cannot exceed 200/);
      assert.equal(validateAndNormalizeTitle('  Clean Code Notes  '), 'Clean Code Notes');
    });

    it('validates and normalizes URL correctly', () => {
      assert.throws(() => validateAndNormalizeUrl(null), /must be a string/);
      assert.throws(() => validateAndNormalizeUrl('   '), /cannot be empty/);
      assert.throws(() => validateAndNormalizeUrl('not-a-url'), /valid, well-formed URL/);
      assert.throws(() => validateAndNormalizeUrl('javascript:alert(1)'), /must use http or https protocol/);
      assert.throws(() => validateAndNormalizeUrl('file:///etc/passwd'), /must use http or https protocol/);
      assert.throws(() => validateAndNormalizeUrl('data:text/html,<h1>hi</h1>'), /must use http or https protocol/);
      assert.throws(() => validateAndNormalizeUrl('https://example.com/' + 'a'.repeat(2050)), /cannot exceed 2048/);

      assert.equal(
        validateAndNormalizeUrl('  https://react.dev/learn  '),
        'https://react.dev/learn'
      );
      assert.equal(
        validateAndNormalizeUrl('http://insecure.example.com/page'),
        'http://insecure.example.com/page'
      );
    });

    it('validates and normalizes description correctly', () => {
      assert.equal(validateAndNormalizeDescription(null), null);
      assert.equal(validateAndNormalizeDescription(undefined), null);
      assert.equal(validateAndNormalizeDescription('   '), null);
      assert.throws(() => validateAndNormalizeDescription(123), /must be a string/);
      assert.throws(() => validateAndNormalizeDescription('x'.repeat(2001)), /cannot exceed 2000/);
      assert.equal(validateAndNormalizeDescription('  Helpful React hooks guide  '), 'Helpful React hooks guide');
    });

    it('validates and normalizes topic correctly', () => {
      assert.equal(validateAndNormalizeTopic(null), null);
      assert.equal(validateAndNormalizeTopic(undefined), null);
      assert.equal(validateAndNormalizeTopic('   '), null);
      assert.throws(() => validateAndNormalizeTopic(123), /must be a string/);
      assert.throws(() => validateAndNormalizeTopic('t'.repeat(81)), /cannot exceed 80/);
      assert.equal(validateAndNormalizeTopic('  frontend architecture  '), 'frontend architecture');
    });

    it('validates category correctly', () => {
      assert.equal(validateCategory(undefined), 'other');
      assert.equal(validateCategory(null), 'other');
      assert.equal(validateCategory('PDF'), 'pdf');
      assert.equal(validateCategory('Article'), 'article');
      assert.equal(validateCategory('documentation'), 'documentation');
      assert.equal(validateCategory('course'), 'course');
      assert.equal(validateCategory('video'), 'video');
      assert.equal(validateCategory('repository'), 'repository');
      assert.throws(() => validateCategory('spreadsheet'), /Invalid category/);
      assert.throws(() => validateCategory(123), /must be a string/);
    });

    it('validates favorite correctly', () => {
      assert.equal(validateFavorite(undefined), false);
      assert.equal(validateFavorite(null), false);
      assert.equal(validateFavorite(true), true);
      assert.equal(validateFavorite(false), false);
      assert.throws(() => validateFavorite('true'), /must be a boolean/);
    });
  });

  describe('Authentication and Security Enforcements', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const unauth = request(app);

      await unauth.get('/api/documents').expect(401);
      await unauth.post('/api/documents').send({ title: 'T', url: 'https://example.com' }).expect(401);
      await unauth.get('/api/documents/00000000-0000-4000-8000-000000000001').expect(401);
      await unauth.patch('/api/documents/00000000-0000-4000-8000-000000000001').send({ title: 'U' }).expect(401);
      await unauth.post('/api/documents/00000000-0000-4000-8000-000000000001/favorite').expect(401);
      await unauth.post('/api/documents/00000000-0000-4000-8000-000000000001/unfavorite').expect(401);
      await unauth.delete('/api/documents/00000000-0000-4000-8000-000000000001').expect(401);
    });

    it('rejects mutating requests without CSRF token with 403', async () => {
      const agent = request.agent(app);
      const fakeUuid = '00000000-0000-4000-8000-000000000001';

      await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .send({ title: 'Test Doc', url: 'https://example.com' })
        .expect(403);

      await agent
        .patch(`/api/documents/${fakeUuid}`)
        .set('x-test-user-id', USER_A_ID)
        .send({ title: 'Updated' })
        .expect(403);

      await agent
        .post(`/api/documents/${fakeUuid}/favorite`)
        .set('x-test-user-id', USER_A_ID)
        .expect(403);

      await agent
        .post(`/api/documents/${fakeUuid}/unfavorite`)
        .set('x-test-user-id', USER_A_ID)
        .expect(403);

      await agent
        .delete(`/api/documents/${fakeUuid}`)
        .set('x-test-user-id', USER_A_ID)
        .expect(403);
    });
  });

  describe('Document CRUD & Workflows', () => {
    it('creates a document with default and explicit fields', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      // 1. Create with defaults
      const res1 = await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'React Docs',
          url: 'https://react.dev',
        })
        .expect(201);

      assert.equal(res1.body.title, 'React Docs');
      assert.equal(res1.body.url, 'https://react.dev');
      assert.equal(res1.body.category, 'other');
      assert.equal(res1.body.description, null);
      assert.equal(res1.body.topic, null);
      assert.equal(res1.body.favorite, false);
      assert.ok(res1.body.id);

      // 2. Create with all fields specified
      const res2 = await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'PostgreSQL Manual',
          url: 'https://www.postgresql.org/docs/current/',
          description: 'Official PostgreSQL reference manual',
          category: 'documentation',
          topic: 'database',
          favorite: true,
        })
        .expect(201);

      assert.equal(res2.body.title, 'PostgreSQL Manual');
      assert.equal(res2.body.url, 'https://www.postgresql.org/docs/current/');
      assert.equal(res2.body.category, 'documentation');
      assert.equal(res2.body.topic, 'database');
      assert.equal(res2.body.favorite, true);
    });

    it('rejects invalid inputs on creation', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      // Missing title
      await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ url: 'https://example.com' })
        .expect(400);

      // Missing url
      await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Some Title' })
        .expect(400);

      // Invalid url scheme
      await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Exploit', url: 'javascript:alert(1)' })
        .expect(400);

      // Unknown field
      await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Exploit', url: 'https://example.com', hacked: true })
        .expect(400);
    });

    it('lists documents with search, category/topic/favorite filters, and pagination', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      // Seed 3 documents
      await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'React Official Documentation',
          url: 'https://react.dev',
          category: 'documentation',
          topic: 'Frontend',
          favorite: false,
        })
        .expect(201);

      await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Clean Architecture PDF',
          url: 'https://example.com/clean-arch.pdf',
          category: 'pdf',
          topic: 'Architecture',
          favorite: true,
        })
        .expect(201);

      await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Node.js Performance Article',
          url: 'https://example.com/node-perf',
          category: 'article',
          topic: 'Backend',
          favorite: false,
        })
        .expect(201);

      // List all: favorites should come first
      const resAll = await agent
        .get('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);
      assert.equal(resAll.body.total, 3);
      assert.equal(resAll.body.documents[0].title, 'Clean Architecture PDF');
      assert.equal(resAll.body.documents[0].favorite, true);

      // Filter by category
      const resCat = await agent
        .get('/api/documents?category=pdf')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);
      assert.equal(resCat.body.total, 1);
      assert.equal(resCat.body.documents[0].title, 'Clean Architecture PDF');

      // Filter by topic
      const resTopic = await agent
        .get('/api/documents?topic=Frontend')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);
      assert.equal(resTopic.body.total, 1);
      assert.equal(resTopic.body.documents[0].title, 'React Official Documentation');

      // Filter by favorite
      const resFav = await agent
        .get('/api/documents?favorite=true')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);
      assert.equal(resFav.body.total, 1);
      assert.equal(resFav.body.documents[0].title, 'Clean Architecture PDF');

      // Search query
      const resSearch = await agent
        .get('/api/documents?q=performance')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);
      assert.equal(resSearch.body.total, 1);
      assert.equal(resSearch.body.documents[0].title, 'Node.js Performance Article');

      // Pagination
      const resPage = await agent
        .get('/api/documents?limit=2&offset=0')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);
      assert.equal(resPage.body.documents.length, 2);
      assert.equal(resPage.body.hasMore, true);
      assert.equal(resPage.body.total, 3);
    });

    it('enforces multi-tenant ownership isolation between User A and User B', async () => {
      const agentA = request.agent(app);
      const agentB = request.agent(app);
      const { csrfToken: csrfA } = await getCsrfAndCookie(agentA);
      const { csrfToken: csrfB } = await getCsrfAndCookie(agentB);

      const createdRes = await agentA
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfA)
        .send({
          title: 'Secret User A Spec',
          url: 'https://example.com/spec',
        })
        .expect(201);

      const docId = createdRes.body.id;

      // User B cannot get it
      await agentB
        .get(`/api/documents/${docId}`)
        .set('x-test-user-id', USER_B_ID)
        .expect(404);

      // User B cannot see it in list
      const listB = await agentB
        .get('/api/documents')
        .set('x-test-user-id', USER_B_ID)
        .expect(200);
      assert.equal(listB.body.total, 0);

      // User B cannot patch it
      await agentB
        .patch(`/api/documents/${docId}`)
        .set('x-test-user-id', USER_B_ID)
        .set('x-csrf-token', csrfB)
        .send({ title: 'Hijacked' })
        .expect(404);

      // User B cannot favorite/unfavorite it
      await agentB
        .post(`/api/documents/${docId}/favorite`)
        .set('x-test-user-id', USER_B_ID)
        .set('x-csrf-token', csrfB)
        .expect(404);

      // User B cannot delete it
      await agentB
        .delete(`/api/documents/${docId}`)
        .set('x-test-user-id', USER_B_ID)
        .set('x-csrf-token', csrfB)
        .expect(404);
    });

    it('toggles favorite and unfavorite status', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const created = await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Favorite Candidate',
          url: 'https://example.com/fav',
          favorite: false,
        })
        .expect(201);

      const docId = created.body.id;

      // Mark favorite
      const favRes = await agent
        .post(`/api/documents/${docId}/favorite`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .expect(200);
      assert.equal(favRes.body.favorite, true);

      // Unfavorite
      const unfavRes = await agent
        .post(`/api/documents/${docId}/unfavorite`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .expect(200);
      assert.equal(unfavRes.body.favorite, false);
    });

    it('updates document details via PATCH', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const created = await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Initial Title',
          url: 'https://initial.com',
          category: 'other',
        })
        .expect(201);

      const docId = created.body.id;

      const patchRes = await agent
        .patch(`/api/documents/${docId}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Updated Title',
          url: 'https://updated.com',
          category: 'course',
          topic: 'Computer Science',
          description: 'Updated description here',
        })
        .expect(200);

      assert.equal(patchRes.body.title, 'Updated Title');
      assert.equal(patchRes.body.url, 'https://updated.com');
      assert.equal(patchRes.body.category, 'course');
      assert.equal(patchRes.body.topic, 'Computer Science');
      assert.equal(patchRes.body.description, 'Updated description here');
    });

    it('soft-deletes a document and excludes it from lists and gets', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const created = await agent
        .post('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'To Be Deleted',
          url: 'https://example.com/delete-me',
        })
        .expect(201);

      const docId = created.body.id;

      // Soft delete
      await agent
        .delete(`/api/documents/${docId}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .expect(204);

      // GET by id returns 404
      await agent
        .get(`/api/documents/${docId}`)
        .set('x-test-user-id', USER_A_ID)
        .expect(404);

      // Excluded from list
      const listRes = await agent
        .get('/api/documents')
        .set('x-test-user-id', USER_A_ID)
        .expect(200);
      assert.equal(listRes.body.total, 0);
      assert.equal(listRes.body.documents.length, 0);
    });
  });
});

