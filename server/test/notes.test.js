import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createNotesRouter } from '../src/routes/notes.routes.js';
import {
  validateAndNormalizeTitle,
  validateContent,
  derivePlainText,
  generatePreview,
  ValidationError,
  LIMITS,
} from '../src/notes/contentValidator.js';

// ─────────────────────────────────────────────────────────────────────────────
// Content Validator & Derived Plain Text Unit Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Content Validator & Derived Plain Text Unit Tests', () => {
  it('normalizes blank or whitespace-only title to "Untitled note"', () => {
    assert.strictEqual(validateAndNormalizeTitle(''), 'Untitled note');
    assert.strictEqual(validateAndNormalizeTitle('   '), 'Untitled note');
    assert.strictEqual(validateAndNormalizeTitle('  My Note  '), 'My Note');
  });

  it('rejects non-string titles or titles exceeding 200 characters', () => {
    assert.throws(
      () => validateAndNormalizeTitle(123),
      (err) => err instanceof ValidationError && err.status === 400
    );
    assert.throws(
      () => validateAndNormalizeTitle('a'.repeat(201)),
      (err) => err instanceof ValidationError && err.status === 400
    );
  });

  it('validates canonical empty document', () => {
    const emptyDoc1 = { type: 'doc' };
    const emptyDoc2 = { type: 'doc', content: [] };
    const emptyDoc3 = { type: 'doc', content: [{ type: 'paragraph' }] };

    assert.doesNotThrow(() => validateContent(emptyDoc1));
    assert.doesNotThrow(() => validateContent(emptyDoc2));
    assert.doesNotThrow(() => validateContent(emptyDoc3));

    assert.strictEqual(derivePlainText(emptyDoc1), '');
    assert.strictEqual(derivePlainText(emptyDoc2), '');
    assert.strictEqual(derivePlainText(emptyDoc3), '');
  });

  it('validates supported rich-text elements and text marks', () => {
    const richDoc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Main Heading' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Normal text ' },
            {
              type: 'text',
              text: 'bold italic strike code',
              marks: [
                { type: 'bold' },
                { type: 'italic' },
                { type: 'strike' },
                { type: 'code' },
              ],
            },
            { type: 'hardBreak' },
            { type: 'text', text: 'Second line' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Bullet item 1' }],
                },
              ],
            },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Ordered item 1' }],
                },
              ],
            },
          ],
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Quoted insight' }],
            },
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'javascript' },
          content: [{ type: 'text', text: 'const answer = 42;' }],
        },
        {
          type: 'horizontalRule',
        },
      ],
    };

    assert.doesNotThrow(() => validateContent(richDoc));

    const plain = derivePlainText(richDoc);
    assert.ok(plain.includes('Main Heading'));
    assert.ok(plain.includes('bold italic strike code'));
    assert.ok(plain.includes('Bullet item 1'));
    assert.ok(plain.includes('Ordered item 1'));
    assert.ok(plain.includes('const answer = 42;'));
  });

  it('rejects unsupported node types like images, tables, or scripts', () => {
    const invalidNodes = [
      { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://evil.com/x.png' } }] },
      { type: 'doc', content: [{ type: 'table' }] },
      { type: 'doc', content: [{ type: 'script' }] },
    ];

    for (const doc of invalidNodes) {
      assert.throws(
        () => validateContent(doc),
        (err) => err instanceof ValidationError && err.message.includes('Unsupported node type')
      );
    }
  });

  it('rejects unsupported marks like links or underlines', () => {
    const docWithLink = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click here',
              marks: [{ type: 'link', attrs: { href: 'http://example.com' } }],
            },
          ],
        },
      ],
    };

    assert.throws(
      () => validateContent(docWithLink),
      (err) => err instanceof ValidationError && err.message.includes('Unsupported mark type')
    );
  });

  it('rejects invalid heading levels (< 1 or > 3)', () => {
    const level4 = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 4 },
          content: [{ type: 'text', text: 'Too deep' }],
        },
      ],
    };
    assert.throws(
      () => validateContent(level4),
      (err) => err instanceof ValidationError && err.message.includes('Heading level must be 1, 2, or 3')
    );
  });

  it('rejects marks on codeBlock text children', () => {
    const codeWithMark = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          content: [
            {
              type: 'text',
              text: 'code',
              marks: [{ type: 'bold' }],
            },
          ],
        },
      ],
    };
    assert.throws(
      () => validateContent(codeWithMark),
      (err) => err instanceof ValidationError && err.message.includes('cannot have marks')
    );
  });

  it('rejects excessively deep document nesting (> 20)', () => {
    let current = { type: 'paragraph', content: [{ type: 'text', text: 'deep' }] };
    for (let i = 0; i < 22; i++) {
      current = { type: 'blockquote', content: [current] };
    }
    const deepDoc = { type: 'doc', content: [current] };

    assert.throws(
      () => validateContent(deepDoc),
      (err) => err instanceof ValidationError && err.message.includes('maximum depth')
    );
  });

  it('rejects content exceeding maximum byte limit (256 KiB)', () => {
    const largeText = 'a'.repeat(LIMITS.MAX_CONTENT_BYTES + 10);
    const hugeDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: largeText }],
        },
      ],
    };

    assert.throws(
      () => validateContent(hugeDoc),
      (err) => err instanceof ValidationError && err.code === 'CONTENT_TOO_LARGE'
    );
  });

  it('generatePreview truncates and normalizes single line with ellipsis', () => {
    const multiLine = 'First line\nSecond line\nThird line';
    const preview = generatePreview(multiLine, 20);
    assert.ok(preview.endsWith('…'));
    assert.ok(!preview.includes('\n'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Notes REST API Route & Concurrency Tests (In-Memory Mock Seams)
// ─────────────────────────────────────────────────────────────────────────────
describe('Notes REST API Route & Concurrency Tests', () => {
  let mockNotes;
  let mockUsers;
  let app;
  let mockNoteRepo;

  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';
  const VALID_NOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const SAMPLE_DOC = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Testing private notes content.' }],
      },
    ],
  };

  beforeEach(() => {
    mockNotes = new Map();
    mockUsers = new Map([
      [USER_A_ID, { id: USER_A_ID, email: 'usera@example.com', createdAt: new Date() }],
      [USER_B_ID, { id: USER_B_ID, email: 'userb@example.com', createdAt: new Date() }],
    ]);

    mockNoteRepo = {
      createNote: async ({ userId, title, contentJson, contentText }) => {
        const id = mockNotes.size === 0
          ? VALID_NOTE_ID
          : `00000000-0000-4000-8000-${String(mockNotes.size).padStart(12, '0')}`;
        const now = new Date();
        const note = {
          id,
          userId,
          title,
          content: contentJson,
          content_text: contentText,
          version: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          deletedAt: null,
        };
        mockNotes.set(id, note);
        return {
          id: note.id,
          title: note.title,
          content: note.content,
          version: note.version,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        };
      },

      findNotesByUserId: async ({ userId, q = '', limit = 20, offset = 0 }) => {
        let notes = Array.from(mockNotes.values()).filter(
          (n) => n.userId === userId && n.deletedAt === null
        );

        if (q) {
          const lowerQ = q.toLowerCase();
          notes = notes.filter(
            (n) =>
              n.title.toLowerCase().includes(lowerQ) ||
              n.content_text.toLowerCase().includes(lowerQ)
          );
        }

        // Sort updated_at desc, id asc
        notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        const paged = notes.slice(offset, offset + limit);
        const hasMore = offset + limit < notes.length;

        return {
          rawItems: paged.map((n) => ({
            id: n.id,
            title: n.title,
            content_text: n.content_text,
            version: n.version,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
          })),
          limit,
          offset,
          hasMore,
        };
      },

      findNoteByIdAndUserId: async ({ id, userId }) => {
        const note = mockNotes.get(id);
        if (!note || note.userId !== userId || note.deletedAt !== null) {
          return null;
        }
        return {
          id: note.id,
          title: note.title,
          content: note.content,
          version: note.version,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        };
      },

      updateNote: async ({ id, userId, expectedVersion, title, contentJson, contentText }) => {
        const note = mockNotes.get(id);
        if (!note || note.userId !== userId || note.deletedAt !== null) {
          return { notFound: true };
        }
        if (note.version !== expectedVersion) {
          return { conflict: true, currentVersion: note.version };
        }

        note.title = title;
        note.content = contentJson;
        note.content_text = contentText;
        note.version += 1;
        note.updatedAt = new Date().toISOString();

        return {
          updatedNote: {
            id: note.id,
            title: note.title,
            content: note.content,
            version: note.version,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          },
        };
      },

      trashNote: async ({ id, userId, expectedVersion }) => {
        const note = mockNotes.get(id);
        if (!note || note.userId !== userId || note.deletedAt !== null) {
          return { notFound: true };
        }
        if (note.version !== expectedVersion) {
          return { conflict: true, currentVersion: note.version };
        }

        note.deletedAt = new Date().toISOString();
        note.version += 1;
        note.updatedAt = new Date().toISOString();

        return { success: true };
      },
    };

    const sessionMiddleware = session({
      secret: 'test-notes-secret-minimum-32-chars!',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    });

    const authRouter = createAuthRouter({
      findUserByIdFn: async (id) => mockUsers.get(id) || null,
      findUserByEmailFn: async (email) => {
        for (const u of mockUsers.values()) {
          if (u.email.toLowerCase() === email.toLowerCase()) return u;
        }
        return null;
      },
    });

    const notesRouter = createNotesRouter({
      noteRepository: mockNoteRepo,
      requireAuthMiddleware: async (req, res, next) => {
        let userId = req.session?.userId;
        if (!userId && req.headers['x-user']) {
          userId = req.headers['x-user'] === 'A' ? USER_A_ID : USER_B_ID;
        }
        if (!userId) {
          return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
        }
        req.user = mockUsers.get(userId);
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
        }
        next();
      },
    });

    app = createApp({
      checkReadiness: async () => true,
      sessionMiddleware,
      authRouter,
      notesRouter,
    });
  });


  // ───────────────────────────────────────────────────────────────────────────
  // Authentication & CSRF Boundaries
  // ───────────────────────────────────────────────────────────────────────────
  describe('Authentication & CSRF Boundaries', () => {
    it('rejects unauthenticated requests to all notes endpoints with 401', async () => {
      await request(app).get('/api/notes').expect(401);
      await request(app).post('/api/notes').send({ title: 'T', content: SAMPLE_DOC }).expect(401);
      await request(app).get(`/api/notes/${VALID_NOTE_ID}`).expect(401);
      await request(app).patch(`/api/notes/${VALID_NOTE_ID}`).send({ title: 'T', content: SAMPLE_DOC, expectedVersion: 1 }).expect(401);
      await request(app).post(`/api/notes/${VALID_NOTE_ID}/trash`).send({ expectedVersion: 1 }).expect(401);
    });

    it('rejects state-changing requests without CSRF token with 403', async () => {
      // Build agent with session established
      const agent = request.agent(app);
      await agent.get('/api/auth/csrf').expect(200);

      // Note mutation without X-CSRF-Token header
      const res = await agent
        .post('/api/notes')
        .set('x-user', 'A')
        .send({ title: 'No CSRF', content: SAMPLE_DOC });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error, 'Forbidden');
    });

    it('rejects state-changing requests from disallowed Origin with 403', async () => {
      const agent = request.agent(app);
      const csrfRes = await agent.get('/api/auth/csrf').expect(200);
      const csrfToken = csrfRes.body.csrfToken;

      const res = await agent
        .post('/api/notes')
        .set('X-CSRF-Token', csrfToken)
        .set('Origin', 'http://malicious-website.com')
        .send({ title: 'Evil Origin', content: SAMPLE_DOC });

      assert.strictEqual(res.status, 403);
    });

    it('applies Cache-Control: no-store header on private notes endpoints', async () => {
      const res = await request(app).get('/api/notes').expect(401);
      assert.ok(res.headers['cache-control']?.includes('no-store'));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD, Concurrency & Ownership Isolation
  // ───────────────────────────────────────────────────────────────────────────
  describe('CRUD, Concurrency & Ownership Isolation', () => {
    let agentA;
    let csrfA;
    let agentB;

    beforeEach(async () => {
      // Setup Agent A
      agentA = request.agent(app);
      const resA = await agentA.get('/api/auth/csrf').expect(200);
      csrfA = resA.body.csrfToken;

      // Setup Agent B
      agentB = request.agent(app);
    });

    it('creates a note with valid title and content (201)', async () => {
      const res = await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Architecture Overview',
          content: SAMPLE_DOC,
        })
        .expect(201);

      assert.strictEqual(res.body.id, VALID_NOTE_ID);
      assert.strictEqual(res.body.title, 'Architecture Overview');
      assert.strictEqual(res.body.version, 1);
      assert.deepStrictEqual(res.body.content, SAMPLE_DOC);
      assert.ok(res.body.createdAt);
      assert.ok(res.body.updatedAt);
    });

    it('defaults blank title to "Untitled note"', async () => {
      const res = await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({
          title: '   ',
          content: SAMPLE_DOC,
        })
        .expect(201);

      assert.strictEqual(res.body.title, 'Untitled note');
    });

    it('rejects unknown or client-supplied ownership/version fields with 400', async () => {
      const res = await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Hacked Note',
          content: SAMPLE_DOC,
          user_id: USER_B_ID, // Forbidden field
        })
        .expect(400);

      assert.strictEqual(res.body.error, 'BadRequest');
      assert.ok(res.body.message.includes('Unknown or unpermitted field'));
    });

    it('lists only the authenticated user active notes with bounded preview', async () => {
      // Seed notes for User A and User B
      await mockNoteRepo.createNote({
        userId: USER_A_ID,
        title: 'User A Note 1',
        contentJson: SAMPLE_DOC,
        contentText: 'First line of User A note.\nSecond paragraph.',
      });

      await mockNoteRepo.createNote({
        userId: USER_B_ID,
        title: 'User B Secret',
        contentJson: SAMPLE_DOC,
        contentText: 'Secret B content.',
      });

      const res = await agentA
        .get('/api/notes')
        .set('x-user', 'A')
        .expect(200);

      assert.strictEqual(res.body.items.length, 1);
      assert.strictEqual(res.body.items[0].title, 'User A Note 1');
      assert.ok(res.body.items[0].preview.includes('First line of User A note.'));
      assert.strictEqual(res.body.items[0].content, undefined, 'List items must not contain raw editor JSON');
    });

    it('validates pagination and search query parameters', async () => {
      await agentA
        .get('/api/notes?limit=-5')
        .set('x-user', 'A')
        .expect(400);

      await agentA
        .get('/api/notes?limit=150')
        .set('x-user', 'A')
        .expect(400);

      await agentA
        .get('/api/notes?offset=invalid')
        .set('x-user', 'A')
        .expect(400);
    });

    it('retrieves full note by ID for owner and returns 404 for other user', async () => {
      const noteId = '33333333-3333-4333-8333-333333333333';
      mockNotes.set(noteId, {
        id: noteId,
        userId: USER_A_ID,
        title: 'Private Note',
        content: SAMPLE_DOC,
        content_text: 'Secret',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // User A (owner) can retrieve it
      const resA = await agentA
        .get(`/api/notes/${noteId}`)
        .set('x-user', 'A')
        .expect(200);

      assert.strictEqual(resA.body.id, noteId);
      assert.strictEqual(resA.body.title, 'Private Note');

      // User B receives 404 (no leak of whether it exists)
      const resB = await agentB
        .get(`/api/notes/${noteId}`)
        .set('x-user', 'B')
        .expect(404);

      assert.strictEqual(resB.body.error, 'NotFound');
    });

    it('rejects malformed UUID with 400', async () => {
      await agentA
        .get('/api/notes/not-a-valid-uuid')
        .set('x-user', 'A')
        .expect(400);
    });

    it('successfully updates note with matching expectedVersion', async () => {
      const noteId = '44444444-4444-4444-8444-444444444444';
      mockNotes.set(noteId, {
        id: noteId,
        userId: USER_A_ID,
        title: 'Old Title',
        content: SAMPLE_DOC,
        content_text: 'Old content',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const updatedDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'New content here.' }],
          },
        ],
      };

      const res = await agentA
        .patch(`/api/notes/${noteId}`)
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'New Title',
          content: updatedDoc,
          expectedVersion: 1,
        })
        .expect(200);

      assert.strictEqual(res.body.version, 2);
      assert.strictEqual(res.body.title, 'New Title');
    });

    it('returns 409 Conflict NOTE_VERSION_CONFLICT when expectedVersion is stale', async () => {
      const noteId = '55555555-5555-4555-8555-555555555555';
      mockNotes.set(noteId, {
        id: noteId,
        userId: USER_A_ID,
        title: 'Already Updated Note',
        content: SAMPLE_DOC,
        content_text: 'Already updated',
        version: 2, // Current version is 2
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await agentA
        .patch(`/api/notes/${noteId}`)
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Concurrent Edit',
          content: SAMPLE_DOC,
          expectedVersion: 1, // Stale version 1
        })
        .expect(409);

      assert.strictEqual(res.body.error, 'Conflict');
      assert.strictEqual(res.body.code, 'NOTE_VERSION_CONFLICT');
      // Ensure data was not overwritten
      assert.strictEqual(mockNotes.get(noteId).title, 'Already Updated Note');
    });

    it('soft-deletes note to trash (204) and excludes it from subsequent queries', async () => {
      const noteId = '66666666-6666-4666-8666-666666666666';
      mockNotes.set(noteId, {
        id: noteId,
        userId: USER_A_ID,
        title: 'To Be Trashed',
        content: SAMPLE_DOC,
        content_text: 'Bye',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // 1. Soft-delete
      await agentA
        .post(`/api/notes/${noteId}/trash`)
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ expectedVersion: 1 })
        .expect(204);

      // Confirm deletedAt is set
      assert.ok(mockNotes.get(noteId).deletedAt !== null);

      // 2. GET detail now returns 404
      await agentA
        .get(`/api/notes/${noteId}`)
        .set('x-user', 'A')
        .expect(404);

      // 3. PATCH returns 404
      await agentA
        .patch(`/api/notes/${noteId}`)
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ title: 'T', content: SAMPLE_DOC, expectedVersion: 2 })
        .expect(404);

      // 4. GET list excludes trashed note
      const listRes = await agentA.get('/api/notes').set('x-user', 'A').expect(200);
      assert.strictEqual(listRes.body.items.length, 0);
    });

    it('returns 409 Conflict when trashing with a stale version', async () => {
      const noteId = '77777777-7777-4777-8777-777777777777';
      mockNotes.set(noteId, {
        id: noteId,
        userId: USER_A_ID,
        title: 'Trash Conflict Note',
        content: SAMPLE_DOC,
        content_text: 'Content',
        version: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await agentA
        .post(`/api/notes/${noteId}/trash`)
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ expectedVersion: 1 }) // Stale version
        .expect(409);

      assert.strictEqual(res.body.code, 'NOTE_VERSION_CONFLICT');
      assert.strictEqual(mockNotes.get(noteId).deletedAt, null);
    });

    it('returns 413 PayloadTooLarge when body exceeds 512 KiB', async () => {
      const hugeString = 'x'.repeat(600 * 1024);
      const res = await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ title: hugeString, content: SAMPLE_DOC });

      assert.strictEqual(res.status, 413);
      assert.strictEqual(res.body.error, 'PayloadTooLarge');
    });
  });
});
