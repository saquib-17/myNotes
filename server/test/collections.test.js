import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createNotesRouter } from '../src/routes/notes.routes.js';
import { createCollectionsRouter } from '../src/routes/collections.routes.js';

describe('Collections REST API & Note Integration Tests (Isolated Seams)', () => {
  let mockUsers;
  let mockNotes;
  let mockCollections;
  let app;
  let mockNoteRepo;
  let mockCollectionRepo;

  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';

  const SAMPLE_DOC = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Collection note content.' }],
      },
    ],
  };

  beforeEach(() => {
    mockUsers = new Map([
      [USER_A_ID, { id: USER_A_ID, email: 'usera@example.com' }],
      [USER_B_ID, { id: USER_B_ID, email: 'userb@example.com' }],
    ]);
    mockCollections = new Map();
    mockNotes = new Map();

    mockCollectionRepo = {
      findCollectionsByUserId: async ({ userId }) => {
        const userCols = Array.from(mockCollections.values()).filter(
          (c) => c.userId === userId && c.deletedAt === null
        );
        userCols.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

        return userCols.map((c) => {
          const count = Array.from(mockNotes.values()).filter(
            (n) => n.userId === userId && n.collectionId === c.id && n.deletedAt === null
          ).length;
          return {
            id: c.id,
            name: c.name,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            noteCount: count,
          };
        });
      },

      findCollectionByIdAndUserId: async ({ id, userId }) => {
        const col = mockCollections.get(id);
        if (!col || col.userId !== userId || col.deletedAt !== null) {
          return null;
        }
        return {
          id: col.id,
          name: col.name,
          createdAt: col.createdAt,
          updatedAt: col.updatedAt,
        };
      },

      createCollection: async ({ userId, name }) => {
        const trimmed = name.trim();
        const existing = Array.from(mockCollections.values()).find(
          (c) => c.userId === userId && c.deletedAt === null && c.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (existing) {
          return { conflict: true };
        }

        const countHex = (mockCollections.size + 1).toString(16).padStart(4, '0');
        const id = `c011ec71-${countHex}-4000-8000-000000000000`;
        const now = new Date().toISOString();
        const col = {
          id,
          userId,
          name: trimmed,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        mockCollections.set(id, col);
        return {
          collection: {
            id: col.id,
            name: col.name,
            createdAt: col.createdAt,
            updatedAt: col.updatedAt,
            noteCount: 0,
          },
        };
      },

      updateCollection: async ({ id, userId, name }) => {
        const col = mockCollections.get(id);
        if (!col || col.userId !== userId || col.deletedAt !== null) {
          return { notFound: true };
        }

        const trimmed = name.trim();
        const duplicate = Array.from(mockCollections.values()).find(
          (c) => c.userId === userId && c.id !== id && c.deletedAt === null && c.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (duplicate) {
          return { conflict: true };
        }

        col.name = trimmed;
        col.updatedAt = new Date().toISOString();
        return {
          collection: {
            id: col.id,
            name: col.name,
            createdAt: col.createdAt,
            updatedAt: col.updatedAt,
          },
        };
      },

      softDeleteCollection: async ({ id, userId }) => {
        const col = mockCollections.get(id);
        if (!col || col.userId !== userId || col.deletedAt !== null) {
          return { notFound: true };
        }

        col.deletedAt = new Date().toISOString();
        col.updatedAt = new Date().toISOString();

        // Clear collection_id on assigned notes
        for (const note of mockNotes.values()) {
          if (note.userId === userId && note.collectionId === id) {
            note.collectionId = null;
          }
        }

        return { success: true };
      },
    };

    mockNoteRepo = {
      createNote: async ({ userId, title, contentJson, contentText, pinned = false, collectionId = null }) => {
        const countHex = (mockNotes.size + 1).toString(16).padStart(4, '0');
        const id = `907e0000-${countHex}-4000-8000-000000000000`;
        const now = new Date().toISOString();
        const note = {
          id,
          userId,
          title,
          content: contentJson,
          content_text: contentText,
          pinned: Boolean(pinned),
          collectionId: collectionId || null,
          version: 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        mockNotes.set(id, note);
        return {
          id: note.id,
          title: note.title,
          content: note.content,
          pinned: note.pinned,
          collectionId: note.collectionId,
          version: note.version,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        };
      },

      findNotesByUserId: async ({ userId, q = '', collectionId, limit = 20, offset = 0 }) => {
        let notes = Array.from(mockNotes.values()).filter(
          (n) => n.userId === userId && n.deletedAt === null
        );

        if (collectionId) {
          notes = notes.filter((n) => n.collectionId === collectionId);
        }

        if (q) {
          const lowerQ = q.toLowerCase();
          notes = notes.filter(
            (n) =>
              n.title.toLowerCase().includes(lowerQ) ||
              n.content_text.toLowerCase().includes(lowerQ)
          );
        }

        notes.sort((a, b) => {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) {
            return a.pinned ? -1 : 1;
          }
          return new Date(b.updatedAt) - new Date(a.updatedAt);
        });

        const paged = notes.slice(offset, offset + limit);
        const hasMore = offset + limit < notes.length;

        return {
          rawItems: paged.map((n) => ({
            id: n.id,
            title: n.title,
            content_text: n.content_text,
            pinned: Boolean(n.pinned),
            collectionId: n.collectionId || null,
            version: n.version,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
          })),
          total: notes.length,
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
          pinned: Boolean(note.pinned),
          collectionId: note.collectionId || null,
          version: note.version,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        };
      },

      updateNote: async ({ id, userId, expectedVersion, title, contentJson, contentText, pinned, collectionId }) => {
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
        if (typeof pinned === 'boolean') {
          note.pinned = pinned;
        }
        if (collectionId !== undefined) {
          note.collectionId = collectionId || null;
        }
        note.version += 1;
        note.updatedAt = new Date().toISOString();

        return {
          updatedNote: {
            id: note.id,
            title: note.title,
            content: note.content,
            pinned: Boolean(note.pinned),
            collectionId: note.collectionId || null,
            version: note.version,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          },
        };
      },
    };

    const sessionMiddleware = session({
      secret: 'test-collections-secret-minimum-32-chars!',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    });

    const authRouter = createAuthRouter({
      findUserByIdFn: async (id) => mockUsers.get(id) || null,
      findUserByEmailFn: async (email) => {
        for (const u of mockUsers.values()) {
          if (u.email === email) return u;
        }
        return null;
      },
    });

    const mockAuthMiddleware = (req, res, next) => {
      const userHeader = req.headers['x-user'];
      const targetUser = userHeader === 'B' ? mockUsers.get(USER_B_ID) : mockUsers.get(USER_A_ID);
      req.user = targetUser;
      req.session = req.session || {};
      req.session.userId = targetUser.id;
      next();
    };

    const notesRouter = createNotesRouter({
      noteRepository: mockNoteRepo,
      collectionRepository: mockCollectionRepo,
      requireAuthMiddleware: mockAuthMiddleware,
    });

    const collectionsRouter = createCollectionsRouter({
      collectionRepository: mockCollectionRepo,
      noteRepository: mockNoteRepo,
      requireAuthMiddleware: mockAuthMiddleware,
    });

    app = createApp({
      sessionMiddleware,
      authRouter,
      notesRouter,
      collectionsRouter,
    });
  });

  describe('Collection CRUD & Validation', () => {
    let agentA;
    let csrfA;
    let agentB;
    let csrfB;

    beforeEach(async () => {
      agentA = request.agent(app);
      agentB = request.agent(app);

      const csrfResA = await agentA.get('/api/auth/csrf').set('x-user', 'A').expect(200);
      csrfA = csrfResA.body.csrfToken;

      const csrfResB = await agentB.get('/api/auth/csrf').set('x-user', 'B').expect(200);
      csrfB = csrfResB.body.csrfToken;
    });

    it('creates a collection with valid name and returns 201', async () => {
      const res = await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Java Programming' })
        .expect(201);

      assert.strictEqual(res.body.name, 'Java Programming');
      assert.strictEqual(res.body.noteCount, 0);
      assert.ok(res.body.id);
    });

    it('rejects blank, empty, or whitespace-only collection name with 400', async () => {
      await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: '   ' })
        .expect(400);

      await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: '' })
        .expect(400);
    });

    it('rejects collection names exceeding 80 characters with 400', async () => {
      await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'A'.repeat(81) })
        .expect(400);
    });

    it('rejects duplicate active collection name with 409 Conflict', async () => {
      await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'DSA Prep' })
        .expect(201);

      // Same name (case-insensitive)
      const dupRes = await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'dsa prep' })
        .expect(409);

      assert.strictEqual(dupRes.body.error, 'Conflict');
    });

    it('lists active collections with note count sorted alphabetically', async () => {
      await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Bravo Collection' })
        .expect(201);

      const colA = await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Alpha Collection' })
        .expect(201);

      // Create note assigned to Alpha
      await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ title: 'Alpha Note', content: SAMPLE_DOC, collectionId: colA.body.id })
        .expect(201);

      const listRes = await agentA.get('/api/collections').set('x-user', 'A').expect(200);
      assert.strictEqual(listRes.body.items.length, 2);
      assert.strictEqual(listRes.body.items[0].name, 'Alpha Collection');
      assert.strictEqual(listRes.body.items[0].noteCount, 1);
      assert.strictEqual(listRes.body.items[1].name, 'Bravo Collection');
      assert.strictEqual(listRes.body.items[1].noteCount, 0);
    });

    it('renames an active collection and rejects conflicts', async () => {
      const col = await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Old Name' })
        .expect(201);

      const renameRes = await agentA
        .patch(`/api/collections/${col.body.id}`)
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'New Renamed Name' })
        .expect(200);

      assert.strictEqual(renameRes.body.name, 'New Renamed Name');

      // Create another collection and try renaming to it -> 409
      await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Existing Name' })
        .expect(201);

      await agentA
        .patch(`/api/collections/${col.body.id}`)
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Existing Name' })
        .expect(409);
    });

    it('soft-deletes collection and unassigns notes without deleting them', async () => {
      const col = await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Temporary Collection' })
        .expect(201);

      const note = await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ title: 'Important Note Inside', content: SAMPLE_DOC, collectionId: col.body.id })
        .expect(201);

      assert.strictEqual(note.body.collectionId, col.body.id);

      // Soft delete collection
      await agentA
        .delete(`/api/collections/${col.body.id}`)
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .expect(204);

      // Collection is no longer in active list
      const colsRes = await agentA.get('/api/collections').set('x-user', 'A').expect(200);
      assert.ok(!colsRes.body.items.some((c) => c.id === col.body.id));

      // Note still exists, active, and has collectionId set to null
      const noteRes = await agentA.get(`/api/notes/${note.body.id}`).set('x-user', 'A').expect(200);
      assert.strictEqual(noteRes.body.collectionId, null);
      assert.strictEqual(noteRes.body.title, 'Important Note Inside');
    });

    it('enforces ownership isolation: User B cannot view, rename, or delete User A collection', async () => {
      const colA = await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'User A Secret Col' })
        .expect(201);

      // User B lists: does not include colA
      const listB = await agentB.get('/api/collections').set('x-user', 'B').expect(200);
      assert.ok(!listB.body.items.some((c) => c.id === colA.body.id));

      // User B tries to rename colA -> 404
      await agentB
        .patch(`/api/collections/${colA.body.id}`)
        .set('X-CSRF-Token', csrfB)
        .set('x-user', 'B')
        .send({ name: 'Hacked Name' })
        .expect(404);

      // User B tries to delete colA -> 404
      await agentB
        .delete(`/api/collections/${colA.body.id}`)
        .set('X-CSRF-Token', csrfB)
        .set('x-user', 'B')
        .expect(404);

      // User B cannot assign colA to their note -> 400
      await agentB
        .post('/api/notes')
        .set('X-CSRF-Token', csrfB)
        .set('x-user', 'B')
        .send({ title: 'User B Note', content: SAMPLE_DOC, collectionId: colA.body.id })
        .expect(400);
    });

    it('GET /api/collections/:id/notes lists collection notes and respects pinned-first ordering', async () => {
      const col = await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Physics Notes' })
        .expect(201);

      // Note 1 (unpinned)
      const n1 = await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ title: 'Older Physics Note', content: SAMPLE_DOC, collectionId: col.body.id })
        .expect(201);

      // Note 2 (pinned)
      const n2 = await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ title: 'Pinned Physics Law', content: SAMPLE_DOC, pinned: true, collectionId: col.body.id })
        .expect(201);

      // Unrelated note in no collection
      await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ title: 'Unrelated Chemistry', content: SAMPLE_DOC })
        .expect(201);

      const colNotesRes = await agentA.get(`/api/collections/${col.body.id}/notes`).set('x-user', 'A').expect(200);
      assert.strictEqual(colNotesRes.body.items.length, 2);
      assert.strictEqual(colNotesRes.body.items[0].id, n2.body.id, 'Pinned note comes first');
      assert.strictEqual(colNotesRes.body.items[1].id, n1.body.id);
    });

    it('GET /api/notes?collectionId filters notes by collection', async () => {
      const col = await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Math Notes' })
        .expect(201);

      const n1 = await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ title: 'Calculus Note', content: SAMPLE_DOC, collectionId: col.body.id })
        .expect(201);

      await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ title: 'General Note', content: SAMPLE_DOC })
        .expect(201);

      const filteredRes = await agentA.get(`/api/notes?collectionId=${col.body.id}`).set('x-user', 'A').expect(200);
      assert.strictEqual(filteredRes.body.items.length, 1);
      assert.strictEqual(filteredRes.body.items[0].id, n1.body.id);
    });

    it('PATCH /api/notes/:id can unassign collection by sending collectionId: null', async () => {
      const col = await agentA
        .post('/api/collections')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Temporary Tag' })
        .expect(201);

      const note = await agentA
        .post('/api/notes')
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({ title: 'To Unassign', content: SAMPLE_DOC, collectionId: col.body.id })
        .expect(201);

      assert.strictEqual(note.body.collectionId, col.body.id);

      const patchRes = await agentA
        .patch(`/api/notes/${note.body.id}`)
        .set('X-CSRF-Token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'To Unassign',
          content: SAMPLE_DOC,
          expectedVersion: 1,
          collectionId: null,
        })
        .expect(200);

      assert.strictEqual(patchRes.body.collectionId, null);
    });
  });
});
