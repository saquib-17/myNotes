import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createNotesRouter } from '../src/routes/notes.routes.js';
import { createTagsRouter } from '../src/routes/tags.routes.js';
import { validateAndNormalizeNoteTags, TAG_LIMITS } from '../src/tags/tagRepository.js';

describe('Tags REST API & Note Integration Tests (Isolated Seams)', () => {
  let mockUsers;
  let mockNotes;
  let mockTags;
  let mockNoteTags;
  let app;
  let mockNoteRepo;
  let mockTagRepo;

  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';

  const SAMPLE_DOC = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Tagged note content.' }],
      },
    ],
  };

  beforeEach(() => {
    mockUsers = new Map([
      [USER_A_ID, { id: USER_A_ID, email: 'usera@example.com' }],
      [USER_B_ID, { id: USER_B_ID, email: 'userb@example.com' }],
    ]);
    mockTags = new Map();
    mockNotes = new Map();
    mockNoteTags = new Map(); // key: noteId, value: Set of tagId

    let tagIdCounter = 1;
    let noteIdCounter = 1;

    function getTagsForNote(noteId) {
      const tagIds = mockNoteTags.get(noteId) || new Set();
      const tags = [];
      for (const tId of tagIds) {
        const t = mockTags.get(tId);
        if (t && t.deletedAt === null) {
          tags.push({ id: t.id, name: t.name });
        }
      }
      tags.sort((a, b) => a.name.localeCompare(b.name));
      return tags;
    }

    mockTagRepo = {
      TAG_LIMITS,
      validateAndNormalizeNoteTags,
      findTagsByUserId: async ({ userId }) => {
        const userTags = Array.from(mockTags.values()).filter(
          (t) => t.userId === userId && t.deletedAt === null
        );
        userTags.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

        return userTags.map((t) => {
          let count = 0;
          for (const [nId, tSet] of mockNoteTags.entries()) {
            if (tSet.has(t.id)) {
              const note = mockNotes.get(nId);
              if (note && note.userId === userId && note.deletedAt === null) {
                count++;
              }
            }
          }
          return {
            id: t.id,
            name: t.name,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            noteCount: count,
          };
        });
      },

      findTagByIdAndUserId: async ({ id, userId }) => {
        const t = mockTags.get(id);
        if (t && t.userId === userId && t.deletedAt === null) {
          return {
            id: t.id,
            userId: t.userId,
            name: t.name,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          };
        }
        return null;
      },

      createTag: async ({ userId, name }) => {
        const normalized = name.trim().replace(/\s+/g, ' ');
        const existing = Array.from(mockTags.values()).find(
          (t) => t.userId === userId && t.name.toLowerCase() === normalized.toLowerCase()
        );
        if (existing && existing.deletedAt === null) {
          return { conflict: true };
        }
        if (existing && existing.deletedAt !== null) {
          existing.deletedAt = null;
          existing.name = normalized;
          existing.updatedAt = new Date().toISOString();
          return {
            tag: {
              id: existing.id,
              userId: existing.userId,
              name: existing.name,
              createdAt: existing.createdAt,
              updatedAt: existing.updatedAt,
            },
          };
        }

        const countHex = String(tagIdCounter++).padStart(4, '0');
        const newId = `33333333-3333-4333-8333-${countHex}00000000`;
        const newTag = {
          id: newId,
          userId,
          name: normalized,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        };
        mockTags.set(newId, newTag);
        return {
          tag: {
            id: newTag.id,
            userId: newTag.userId,
            name: newTag.name,
            createdAt: newTag.createdAt,
            updatedAt: newTag.updatedAt,
          },
        };
      },

      updateTag: async ({ id, userId, name }) => {
        const tag = mockTags.get(id);
        if (!tag || tag.userId !== userId || tag.deletedAt !== null) {
          return { notFound: true };
        }

        const normalized = name.trim().replace(/\s+/g, ' ');
        const conflict = Array.from(mockTags.values()).find(
          (t) =>
            t.userId === userId &&
            t.id !== id &&
            t.deletedAt === null &&
            t.name.toLowerCase() === normalized.toLowerCase()
        );
        if (conflict) {
          return { conflict: true };
        }

        tag.name = normalized;
        tag.updatedAt = new Date().toISOString();
        return {
          tag: {
            id: tag.id,
            userId: tag.userId,
            name: tag.name,
            createdAt: tag.createdAt,
            updatedAt: tag.updatedAt,
          },
        };
      },

      deleteTag: async ({ id, userId }) => {
        const tag = mockTags.get(id);
        if (!tag || tag.userId !== userId || tag.deletedAt !== null) {
          return { notFound: true };
        }

        tag.deletedAt = new Date().toISOString();
        for (const tSet of mockNoteTags.values()) {
          tSet.delete(id);
        }
        return { deletedTag: tag };
      },

      findOrCreateTagsByNames: async ({ userId, names }) => {
        const result = [];
        for (const name of names) {
          const res = await mockTagRepo.createTag({ userId, name });
          result.push(res.tag || Array.from(mockTags.values()).find((t) => t.userId === userId && t.name.toLowerCase() === name.toLowerCase()));
        }
        return result;
      },

      syncNoteTags: async ({ noteId, userId, tagNames }) => {
        if (!tagNames || tagNames.length === 0) {
          mockNoteTags.set(noteId, new Set());
          return [];
        }
        const createdTags = await mockTagRepo.findOrCreateTagsByNames({ userId, names: tagNames });
        const tagIdSet = new Set(createdTags.map((t) => t.id));
        mockNoteTags.set(noteId, tagIdSet);
        return createdTags.map((t) => ({ id: t.id, name: t.name }));
      },

      findTagsByNoteId: async ({ noteId }) => {
        return getTagsForNote(noteId);
      },
    };

    mockNoteRepo = {
      createNote: async ({ userId, title, contentJson, contentText, pinned, collectionId, tags }) => {
        const countHex = String(noteIdCounter++).padStart(4, '0');
        const id = `44444444-4444-4444-8444-${countHex}00000000`;
        const newNote = {
          id,
          userId,
          title,
          content: contentJson,
          contentText,
          pinned: Boolean(pinned),
          collectionId: collectionId || null,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        };
        mockNotes.set(id, newNote);

        let noteTags = [];
        if (tags !== undefined) {
          noteTags = await mockTagRepo.syncNoteTags({
            noteId: id,
            userId,
            tagNames: tags,
          });
        }

        return {
          ...newNote,
          tags: noteTags,
        };
      },

      findNoteByIdAndUserId: async ({ id, userId }) => {
        const note = mockNotes.get(id);
        if (note && note.userId === userId && note.deletedAt === null) {
          return {
            ...note,
            tags: getTagsForNote(id),
          };
        }
        return null;
      },

      findNotesByUserId: async ({ userId, q = '', tagId, tag, limit = 20, offset = 0 }) => {
        let notes = Array.from(mockNotes.values()).filter(
          (n) => n.userId === userId && n.deletedAt === null
        );

        if (tagId) {
          notes = notes.filter((n) => {
            const tSet = mockNoteTags.get(n.id);
            return tSet && tSet.has(tagId);
          });
        } else if (tag) {
          notes = notes.filter((n) => {
            const tags = getTagsForNote(n.id);
            return tags.some((t) => t.name.toLowerCase() === tag.toLowerCase());
          });
        }

        if (q && q.trim()) {
          const lowerQ = q.trim().toLowerCase();
          notes = notes.filter(
            (n) =>
              n.title.toLowerCase().includes(lowerQ) ||
              (n.contentText && n.contentText.toLowerCase().includes(lowerQ))
          );
        }

        notes.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

        const total = notes.length;
        const page = notes.slice(offset, offset + limit);

        return {
          rawItems: page.map((n) => ({
            id: n.id,
            title: n.title,
            content_text: n.contentText,
            pinned: n.pinned,
            collectionId: n.collectionId,
            tags: getTagsForNote(n.id),
            version: n.version,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
          })),
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        };
      },

      updateNote: async ({ id, userId, expectedVersion, title, contentJson, contentText, pinned, collectionId, tags }) => {
        const note = mockNotes.get(id);
        if (!note || note.userId !== userId || note.deletedAt !== null) {
          return { notFound: true };
        }
        if (note.version !== expectedVersion) {
          return { conflict: true, currentVersion: note.version };
        }

        note.title = title;
        note.content = contentJson;
        note.contentText = contentText;
        if (pinned !== undefined) note.pinned = Boolean(pinned);
        if (collectionId !== undefined) note.collectionId = collectionId;
        note.version += 1;
        note.updatedAt = new Date().toISOString();

        let noteTags;
        if (tags !== undefined) {
          noteTags = await mockTagRepo.syncNoteTags({
            noteId: id,
            userId,
            tagNames: tags,
          });
        } else {
          noteTags = getTagsForNote(id);
        }

        return {
          updatedNote: {
            ...note,
            tags: noteTags,
          },
        };
      },

      setNotePinned: async ({ id, userId, pinned }) => {
        const note = mockNotes.get(id);
        if (!note || note.userId !== userId || note.deletedAt !== null) {
          return { notFound: true };
        }
        note.pinned = Boolean(pinned);
        note.updatedAt = new Date().toISOString();
        return {
          updatedNote: {
            ...note,
            tags: getTagsForNote(id),
          },
        };
      },

      trashNote: async ({ id, userId, expectedVersion }) => {
        const note = mockNotes.get(id);
        if (!note || note.userId !== userId || note.deletedAt !== null) {
          return { notFound: true };
        }
        if (note.version !== expectedVersion) {
          return { conflict: true };
        }
        note.deletedAt = new Date().toISOString();
        return { trashedNote: note };
      },

      findTrashedNotesByUserId: async ({ userId, limit = 20, offset = 0 }) => {
        const trashed = Array.from(mockNotes.values()).filter(
          (n) => n.userId === userId && n.deletedAt !== null
        );
        const page = trashed.slice(offset, offset + limit);
        return {
          rawItems: page.map((n) => ({
            id: n.id,
            title: n.title,
            content_text: n.contentText,
            pinned: n.pinned,
            collectionId: n.collectionId,
            tags: getTagsForNote(n.id),
            version: n.version,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
            deletedAt: n.deletedAt,
          })),
          total: trashed.length,
          limit,
          offset,
          hasMore: offset + limit < trashed.length,
        };
      },

      restoreNote: async ({ id, userId }) => {
        const note = mockNotes.get(id);
        if (!note || note.userId !== userId || note.deletedAt === null) {
          return { notFound: true };
        }
        note.deletedAt = null;
        note.updatedAt = new Date().toISOString();
        return {
          restoredNote: {
            ...note,
            tags: getTagsForNote(id),
          },
        };
      },
    };

    const sessionMiddleware = session({
      secret: 'test-secret-tags-12345678901234567890',
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
      if (userHeader === 'unauthenticated') {
        return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      }
      const targetUser = userHeader === 'B' ? mockUsers.get(USER_B_ID) : mockUsers.get(USER_A_ID);
      req.user = targetUser;
      req.session = req.session || {};
      req.session.userId = targetUser.id;
      next();
    };

    const tagsRouter = createTagsRouter({
      tagRepository: mockTagRepo,
      noteRepository: mockNoteRepo,
      requireAuthMiddleware: mockAuthMiddleware,
    });

    const notesRouter = createNotesRouter({
      noteRepository: mockNoteRepo,
      tagRepository: mockTagRepo,
      requireAuthMiddleware: mockAuthMiddleware,
    });

    app = createApp({
      checkReadiness: async () => true,
      sessionMiddleware,
      authRouter,
      tagsRouter,
      notesRouter,
    });
  });

  describe('Authentication & Authorization Isolation', () => {
    it('rejects unauthenticated requests to GET /api/tags with 401', async () => {
      const res = await request(app).get('/api/tags').set('x-user', 'unauthenticated');
      assert.strictEqual(res.status, 401);
    });

    it('rejects unauthenticated requests to POST /api/tags with 401', async () => {
      const res = await request(app).post('/api/tags').set('x-user', 'unauthenticated').send({ name: 'Testing' });
      assert.strictEqual(res.status, 401);
    });

    it('rejects unauthenticated requests to GET /api/tags/:id/notes with 401', async () => {
      const res = await request(app).get('/api/tags/11111111-1111-4111-8111-111111111111/notes').set('x-user', 'unauthenticated');
      assert.strictEqual(res.status, 401);
    });
  });

  describe('Tag CRUD and Ownership Isolation', () => {
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

    it('creates, lists, renames, and soft deletes a tag', async () => {
      // 1. Create tag
      const createRes = await agentA
        .post('/api/tags')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({ name: '  JavaScript  ' });

      assert.strictEqual(createRes.status, 201);
      assert.strictEqual(createRes.body.name, 'JavaScript');
      const tagId = createRes.body.id;

      // 2. List tags
      const listRes = await agentA.get('/api/tags').set('x-user', 'A');
      assert.strictEqual(listRes.status, 200);
      assert.strictEqual(listRes.body.tags.length, 1);
      assert.strictEqual(listRes.body.tags[0].name, 'JavaScript');
      assert.strictEqual(listRes.body.tags[0].noteCount, 0);

      // 3. Rename tag
      const renameRes = await agentA
        .patch(`/api/tags/${tagId}`)
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'TypeScript' });

      assert.strictEqual(renameRes.status, 200);
      assert.strictEqual(renameRes.body.name, 'TypeScript');

      // 4. Delete tag
      const deleteRes = await agentA
        .delete(`/api/tags/${tagId}`)
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A');

      assert.strictEqual(deleteRes.status, 204);

      // 5. Verify tag list is now empty
      const afterDeleteRes = await agentA.get('/api/tags').set('x-user', 'A');
      assert.strictEqual(afterDeleteRes.status, 200);
      assert.strictEqual(afterDeleteRes.body.tags.length, 0);
    });

    it('enforces case-insensitive uniqueness per user (409 conflict)', async () => {
      const res1 = await agentA
        .post('/api/tags')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'React' });
      assert.strictEqual(res1.status, 201);

      const res2 = await agentA
        .post('/api/tags')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'react' });
      assert.strictEqual(res2.status, 409);
      assert.strictEqual(res2.body.code, 'TAG_CONFLICT');
    });

    it('allows different users to have tags with the same name', async () => {
      const resA = await agentA
        .post('/api/tags')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Algorithm' });
      assert.strictEqual(resA.status, 201);

      const resB = await agentB
        .post('/api/tags')
        .set('x-csrf-token', csrfB)
        .set('x-user', 'B')
        .send({ name: 'Algorithm' });
      assert.strictEqual(resB.status, 201);
      assert.notStrictEqual(resA.body.id, resB.body.id);

      // User A only sees their own tag
      const listA = await agentA.get('/api/tags').set('x-user', 'A');
      assert.strictEqual(listA.body.tags.length, 1);
      assert.strictEqual(listA.body.tags[0].id, resA.body.id);
    });

    it('validates tag name length and rejects empty names or unpermitted fields', async () => {
      // Empty name
      const res1 = await agentA
        .post('/api/tags')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({ name: '   ' });
      assert.strictEqual(res1.status, 400);

      // Exceeds 40 chars
      const res2 = await agentA
        .post('/api/tags')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'a'.repeat(41) });
      assert.strictEqual(res2.status, 400);

      // Extra unknown field
      const res3 = await agentA
        .post('/api/tags')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({ name: 'Valid', extra: 'forbidden' });
      assert.strictEqual(res3.status, 400);
    });
  });

  describe('Notes with Tags Integration', () => {
    let agentA;
    let csrfA;

    beforeEach(async () => {
      agentA = request.agent(app);
      const csrfRes = await agentA.get('/api/auth/csrf').set('x-user', 'A').expect(200);
      csrfA = csrfRes.body.csrfToken;
    });

    it('creates a note with tags, returning tag objects on note and updating tag counts', async () => {
      const noteRes = await agentA
        .post('/api/notes')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Docker Setup',
          content: SAMPLE_DOC,
          tags: ['devops', 'docker'],
        });

      assert.strictEqual(noteRes.status, 201);
      assert.strictEqual(noteRes.body.tags.length, 2);
      assert.deepStrictEqual(
        noteRes.body.tags.map((t) => t.name).sort(),
        ['devops', 'docker']
      );

      // Verify tag list counts
      const tagsRes = await agentA.get('/api/tags').set('x-user', 'A');
      assert.strictEqual(tagsRes.status, 200);
      assert.strictEqual(tagsRes.body.tags.length, 2);
      for (const t of tagsRes.body.tags) {
        assert.strictEqual(t.noteCount, 1);
      }
    });

    it('enforces maximum 20 tags per note', async () => {
      const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
      const res = await agentA
        .post('/api/notes')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Too Many Tags Note',
          content: SAMPLE_DOC,
          tags: tooManyTags,
        });

      assert.strictEqual(res.status, 400);
    });

    it('updates note tags and allows clearing tags with empty array', async () => {
      const createRes = await agentA
        .post('/api/notes')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Backend architecture',
          content: SAMPLE_DOC,
          tags: ['backend', 'express'],
        });
      const noteId = createRes.body.id;

      // Update tags
      const updateRes = await agentA
        .patch(`/api/notes/${noteId}`)
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Backend architecture',
          content: SAMPLE_DOC,
          expectedVersion: 1,
          tags: ['backend', 'node'],
        });

      assert.strictEqual(updateRes.status, 200);
      assert.deepStrictEqual(
        updateRes.body.tags.map((t) => t.name).sort(),
        ['backend', 'node']
      );

      // Clear tags
      const clearRes = await agentA
        .patch(`/api/notes/${noteId}`)
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Backend architecture',
          content: SAMPLE_DOC,
          expectedVersion: 2,
          tags: [],
        });

      assert.strictEqual(clearRes.status, 200);
      assert.strictEqual(clearRes.body.tags.length, 0);
    });

    it('filters notes by tagId and tag name via GET /api/notes', async () => {
      const res1 = await agentA
        .post('/api/notes')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Note 1',
          content: SAMPLE_DOC,
          tags: ['python', 'ml'],
        });
      const res2 = await agentA
        .post('/api/notes')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Note 2',
          content: SAMPLE_DOC,
          tags: ['javascript', 'web'],
        });

      const tagMl = res1.body.tags.find((t) => t.name === 'ml');

      // Filter by tagId
      const byIdRes = await agentA.get(`/api/notes?tagId=${tagMl.id}`).set('x-user', 'A');
      assert.strictEqual(byIdRes.status, 200);
      assert.strictEqual(byIdRes.body.items.length, 1);
      assert.strictEqual(byIdRes.body.items[0].id, res1.body.id);

      // Filter by tag name
      const byNameRes = await agentA.get('/api/notes?tag=web').set('x-user', 'A');
      assert.strictEqual(byNameRes.status, 200);
      assert.strictEqual(byNameRes.body.items.length, 1);
      assert.strictEqual(byNameRes.body.items[0].id, res2.body.id);
    });

    it('returns tag notes with pinned-first ordering via GET /api/tags/:id/notes', async () => {
      const n1 = await agentA
        .post('/api/notes')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Regular tagged note',
          content: SAMPLE_DOC,
          pinned: false,
          tags: ['study'],
        });

      const n2 = await agentA
        .post('/api/notes')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Pinned tagged note',
          content: SAMPLE_DOC,
          pinned: true,
          tags: ['study'],
        });

      const studyTagId = n1.body.tags[0].id;
      const tagNotesRes = await agentA.get(`/api/tags/${studyTagId}/notes`).set('x-user', 'A');
      assert.strictEqual(tagNotesRes.status, 200);
      assert.strictEqual(tagNotesRes.body.items.length, 2);
      assert.strictEqual(tagNotesRes.body.items[0].id, n2.body.id); // Pinned note first!
      assert.strictEqual(tagNotesRes.body.items[1].id, n1.body.id);
    });

    it('soft deleting a tag unlinks notes without deleting the notes themselves', async () => {
      const note = await agentA
        .post('/api/notes')
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A')
        .send({
          title: 'Important Note',
          content: SAMPLE_DOC,
          tags: ['temporary'],
        });

      const noteId = note.body.id;
      const tagId = note.body.tags[0].id;

      // Delete the tag
      const delRes = await agentA
        .delete(`/api/tags/${tagId}`)
        .set('x-csrf-token', csrfA)
        .set('x-user', 'A');
      assert.strictEqual(delRes.status, 204);

      // Check note still exists and has no tags
      const noteRes = await agentA.get(`/api/notes/${noteId}`).set('x-user', 'A');
      assert.strictEqual(noteRes.status, 200);
      assert.strictEqual(noteRes.body.title, 'Important Note');
      assert.strictEqual(noteRes.body.tags.length, 0);
    });
  });
});

