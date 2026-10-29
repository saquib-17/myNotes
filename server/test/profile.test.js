import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createProfileRouter } from '../src/routes/profile.routes.js';
import { hashPassword } from '../src/auth/password.js';
import { hashSessionId } from '../src/profile/profileRepository.js';

describe('Profile & Settings Backend Tests (Isolated Seams)', () => {
  let mockUsers;
  let mockSessions;
  let mockUserRepo;
  let mockProfileRepo;
  let testApp;

  const USER_A_ID = 'user-a-1111-4000-8000-000000000001';
  const USER_B_ID = 'user-b-2222-4000-8000-000000000002';
  const INITIAL_PASSWORD = 'ValidInitialPassword15Chars!';
  let initialHash;

  beforeEach(async () => {
    initialHash = await hashPassword(INITIAL_PASSWORD);

    mockUsers = new Map([
      [
        USER_A_ID,
        {
          id: USER_A_ID,
          email: 'alice@example.com',
          displayName: 'Alice Original',
          passwordHash: initialHash,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      [
        USER_B_ID,
        {
          id: USER_B_ID,
          email: 'bob@example.com',
          displayName: 'Bob The Builder',
          passwordHash: initialHash,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
    ]);

    mockSessions = new Map([
      [
        'sess_a_current',
        {
          sid: 'sess_a_current',
          sess: {
            userId: USER_A_ID,
            createdAt: '2026-10-28T10:00:00.000Z',
            lastSeenAt: '2026-10-28T12:00:00.000Z',
          },
          expire: new Date(Date.now() + 86400000 * 7),
        },
      ],
      [
        'sess_a_other1',
        {
          sid: 'sess_a_other1',
          sess: {
            userId: USER_A_ID,
            createdAt: '2026-10-27T10:00:00.000Z',
            lastSeenAt: '2026-10-27T12:00:00.000Z',
          },
          expire: new Date(Date.now() + 86400000 * 6),
        },
      ],
      [
        'sess_b_current',
        {
          sid: 'sess_b_current',
          sess: {
            userId: USER_B_ID,
            createdAt: '2026-10-28T11:00:00.000Z',
            lastSeenAt: '2026-10-28T12:00:00.000Z',
          },
          expire: new Date(Date.now() + 86400000 * 7),
        },
      ],
    ]);

    mockUserRepo = {
      findUserById: async (id) => {
        const u = mockUsers.get(id);
        if (!u) return null;
        return {
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          createdAt: u.createdAt,
        };
      },
      findUserWithPasswordById: async (id) => {
        const u = mockUsers.get(id);
        if (!u) return null;
        return { ...u };
      },
      updateUserDisplayName: async (id, name) => {
        const u = mockUsers.get(id);
        if (!u) return null;
        u.displayName = name;
        return {
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          createdAt: u.createdAt,
        };
      },
      updateUserPassword: async (id, hash) => {
        const u = mockUsers.get(id);
        if (!u) return false;
        u.passwordHash = hash;
        return true;
      },
    };

    mockProfileRepo = {
      getUserSessions: async ({ userId, currentSessionId }) => {
        const results = [];
        for (const [sid, row] of mockSessions.entries()) {
          if (row.sess.userId === userId && row.expire > new Date()) {
            results.push({
              id: hashSessionId(sid),
              createdAt: row.sess.createdAt || null,
              lastSeenAt: row.sess.lastSeenAt || null,
              expiresAt: row.expire.toISOString(),
              currentSession: Boolean(currentSessionId && sid === currentSessionId),
            });
          }
        }
        return results;
      },
      invalidateOtherSessions: async ({ userId, currentSessionId }) => {
        let deleted = 0;
        for (const [sid, row] of Array.from(mockSessions.entries())) {
          if (row.sess.userId === userId && sid !== currentSessionId) {
            mockSessions.delete(sid);
            deleted++;
          }
        }
        return deleted;
      },
      invalidateAllUserSessions: async ({ userId }) => {
        let deleted = 0;
        for (const [sid, row] of Array.from(mockSessions.entries())) {
          if (row.sess.userId === userId) {
            mockSessions.delete(sid);
            deleted++;
          }
        }
        return deleted;
      },
    };

    // Construct testApp with authenticated test user A by default
    const profileRouter = createProfileRouter({
      userRepository: mockUserRepo,
      profileRepository: mockProfileRepo,
      requireAuthMiddleware: (req, res, next) => {
        const authHeader = req.headers['x-test-user'];
        const userId = authHeader || USER_A_ID;
        if (userId === 'anonymous') {
          return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
        }
        req.user = { id: userId, email: `${userId}@example.com` };
        req.sessionID = req.headers['x-test-session-id'] || 'sess_a_current';
        req.session = {
          userId,
          csrfToken: 'valid-csrf-token',
          destroy: (cb) => {
            mockSessions.delete(req.sessionID);
            if (cb) cb();
          },
        };
        next();
      },
      requireCsrfMiddleware: (req, res, next) => {
        const token = req.headers['x-csrf-token'];
        if (!token || token !== 'valid-csrf-token') {
          return res.status(403).json({ error: 'Forbidden', message: 'Invalid or missing CSRF token.' });
        }
        next();
      },
    });

    testApp = createApp({
      sessionMiddleware: (req, res, next) => next(),
      profileRouter,
    });
  });

  describe('1. GET /api/profile', () => {
    it('requires authentication and returns 401 when anonymous', async () => {
      const res = await request(testApp)
        .get('/api/profile')
        .set('x-test-user', 'anonymous')
        .expect(401);

      assert.strictEqual(res.body.error, 'Unauthorized');
    });

    it('returns safe profile fields only (no password hash, no tokens)', async () => {
      const res = await request(testApp)
        .get('/api/profile')
        .set('x-test-user', USER_A_ID)
        .expect(200);

      assert.strictEqual(res.body.id, USER_A_ID);
      assert.strictEqual(res.body.email, 'alice@example.com');
      assert.strictEqual(res.body.displayName, 'Alice Original');
      assert.strictEqual(res.body.name, 'Alice Original');
      assert.ok(res.body.createdAt);
      assert.strictEqual(res.body.passwordHash, undefined);
      assert.strictEqual(res.body.password_hash, undefined);
      assert.strictEqual(res.body.token, undefined);
      assert.ok(res.headers['cache-control'].includes('no-store'));
    });
  });

  describe('2. PATCH /api/profile', () => {
    it('requires CSRF protection', async () => {
      await request(testApp)
        .patch('/api/profile')
        .set('x-test-user', USER_A_ID)
        .send({ name: 'Alice New Name' })
        .expect(403);
    });

    it('updates display name successfully with valid trimmed input', async () => {
      const res = await request(testApp)
        .patch('/api/profile')
        .set('x-test-user', USER_A_ID)
        .set('x-csrf-token', 'valid-csrf-token')
        .send({ name: '   Alice In Wonderland   ' })
        .expect(200);

      assert.strictEqual(res.body.displayName, 'Alice In Wonderland');
      assert.strictEqual(res.body.name, 'Alice In Wonderland');
      assert.strictEqual(mockUsers.get(USER_A_ID).displayName, 'Alice In Wonderland');
    });

    it('rejects empty or whitespace-only display name', async () => {
      const res = await request(testApp)
        .patch('/api/profile')
        .set('x-test-user', USER_A_ID)
        .set('x-csrf-token', 'valid-csrf-token')
        .send({ name: '     ' })
        .expect(400);

      assert.strictEqual(res.body.error, 'BadRequest');
      assert.match(res.body.message, /between 1 and 60/i);
    });

    it('rejects display name exceeding 60 characters', async () => {
      const res = await request(testApp)
        .patch('/api/profile')
        .set('x-test-user', USER_A_ID)
        .set('x-csrf-token', 'valid-csrf-token')
        .send({ name: 'A'.repeat(61) })
        .expect(400);

      assert.strictEqual(res.body.error, 'BadRequest');
      assert.match(res.body.message, /between 1 and 60/i);
    });

    it('rejects attempts to change email address', async () => {
      const res = await request(testApp)
        .patch('/api/profile')
        .set('x-test-user', USER_A_ID)
        .set('x-csrf-token', 'valid-csrf-token')
        .send({ email: 'hacker@example.com' })
        .expect(400);

      assert.strictEqual(res.body.error, 'BadRequest');
      assert.match(res.body.message, /cannot be changed/i);
      assert.strictEqual(mockUsers.get(USER_A_ID).email, 'alice@example.com');
    });
  });

  describe('3. POST /api/profile/change-password', () => {
    const NEW_VALID_PASSWORD = 'BrandNewValidPassword15Chars!';

    it('requires CSRF protection', async () => {
      await request(testApp)
        .post('/api/profile/change-password')
        .set('x-test-user', USER_A_ID)
        .send({
          currentPassword: INITIAL_PASSWORD,
          newPassword: NEW_VALID_PASSWORD,
          confirmPassword: NEW_VALID_PASSWORD,
        })
        .expect(403);
    });

    it('rejects missing or empty current password', async () => {
      const res = await request(testApp)
        .post('/api/profile/change-password')
        .set('x-test-user', USER_A_ID)
        .set('x-csrf-token', 'valid-csrf-token')
        .send({
          currentPassword: '',
          newPassword: NEW_VALID_PASSWORD,
          confirmPassword: NEW_VALID_PASSWORD,
        })
        .expect(400);

      assert.match(res.body.message, /current password is required/i);
    });

    it('rejects incorrect current password', async () => {
      const res = await request(testApp)
        .post('/api/profile/change-password')
        .set('x-test-user', USER_A_ID)
        .set('x-csrf-token', 'valid-csrf-token')
        .send({
          currentPassword: 'WrongPasswordLongEnough15!',
          newPassword: NEW_VALID_PASSWORD,
          confirmPassword: NEW_VALID_PASSWORD,
        })
        .expect(400);

      assert.match(res.body.message, /current password is incorrect/i);
    });

    it('rejects mismatched newPassword and confirmPassword', async () => {
      const res = await request(testApp)
        .post('/api/profile/change-password')
        .set('x-test-user', USER_A_ID)
        .set('x-csrf-token', 'valid-csrf-token')
        .send({
          currentPassword: INITIAL_PASSWORD,
          newPassword: NEW_VALID_PASSWORD,
          confirmPassword: 'DifferentNewPassword15Chars!',
        })
        .expect(400);

      assert.match(res.body.message, /do not match/i);
    });

    it('rejects new password that is shorter than policy (< 15 chars)', async () => {
      const res = await request(testApp)
        .post('/api/profile/change-password')
        .set('x-test-user', USER_A_ID)
        .set('x-csrf-token', 'valid-csrf-token')
        .send({
          currentPassword: INITIAL_PASSWORD,
          newPassword: 'ShortPass1234',
          confirmPassword: 'ShortPass1234',
        })
        .expect(400);

      assert.match(res.body.message, /at least 15 characters/i);
    });

    it('rejects reusing the current password as the new password', async () => {
      const res = await request(testApp)
        .post('/api/profile/change-password')
        .set('x-test-user', USER_A_ID)
        .set('x-csrf-token', 'valid-csrf-token')
        .send({
          currentPassword: INITIAL_PASSWORD,
          newPassword: INITIAL_PASSWORD,
          confirmPassword: INITIAL_PASSWORD,
        })
        .expect(400);

      assert.match(res.body.message, /cannot be the same/i);
    });

    it('successfully changes password, keeps current session active, and invalidates other sessions', async () => {
      assert.strictEqual(mockSessions.size, 3);
      assert.ok(mockSessions.has('sess_a_current'));
      assert.ok(mockSessions.has('sess_a_other1'));
      assert.ok(mockSessions.has('sess_b_current'));

      const res = await request(testApp)
        .post('/api/profile/change-password')
        .set('x-test-user', USER_A_ID)
        .set('x-test-session-id', 'sess_a_current')
        .set('x-csrf-token', 'valid-csrf-token')
        .send({
          currentPassword: INITIAL_PASSWORD,
          newPassword: NEW_VALID_PASSWORD,
          confirmPassword: NEW_VALID_PASSWORD,
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.match(res.body.message, /password changed successfully/i);

      // Verify new hash was saved
      const updatedUser = mockUsers.get(USER_A_ID);
      assert.notStrictEqual(updatedUser.passwordHash, initialHash);

      // Verify sessions:
      // User A current session remains
      assert.ok(mockSessions.has('sess_a_current'));
      // User A other session was invalidated
      assert.strictEqual(mockSessions.has('sess_a_other1'), false);
      // User B session untouched (isolation)
      assert.ok(mockSessions.has('sess_b_current'));
    });
  });

  describe('4. GET /api/profile/sessions', () => {
    it('returns active sessions with safe metadata only and marks current session', async () => {
      const res = await request(testApp)
        .get('/api/profile/sessions')
        .set('x-test-user', USER_A_ID)
        .set('x-test-session-id', 'sess_a_current')
        .expect(200);

      assert.ok(Array.isArray(res.body.sessions));
      assert.strictEqual(res.body.sessions.length, 2);

      const current = res.body.sessions.find((s) => s.currentSession === true);
      const other = res.body.sessions.find((s) => s.currentSession === false);

      assert.ok(current);
      assert.ok(other);
      assert.ok(current.id);
      assert.strictEqual(current.id.includes('sess_a_current'), false, 'Never expose raw sid');
      assert.strictEqual(current.token, undefined);
      assert.strictEqual(current.cookie, undefined);
      assert.strictEqual(current.sid, undefined);
      assert.ok(current.expiresAt);
    });
  });

  describe('5. POST /api/profile/sessions/logout-current', () => {
    it('signs out only current session and clears cookie', async () => {
      assert.ok(mockSessions.has('sess_a_current'));
      assert.ok(mockSessions.has('sess_a_other1'));

      const res = await request(testApp)
        .post('/api/profile/sessions/logout-current')
        .set('x-test-user', USER_A_ID)
        .set('x-test-session-id', 'sess_a_current')
        .set('x-csrf-token', 'valid-csrf-token')
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(mockSessions.has('sess_a_current'), false);
      assert.ok(mockSessions.has('sess_a_other1')); // Other session preserved
    });
  });

  describe('6. POST /api/profile/sessions/logout-others', () => {
    it('invalidates other sessions while preserving the current session and other users sessions', async () => {
      assert.ok(mockSessions.has('sess_a_current'));
      assert.ok(mockSessions.has('sess_a_other1'));
      assert.ok(mockSessions.has('sess_b_current'));

      const res = await request(testApp)
        .post('/api/profile/sessions/logout-others')
        .set('x-test-user', USER_A_ID)
        .set('x-test-session-id', 'sess_a_current')
        .set('x-csrf-token', 'valid-csrf-token')
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.count, 1);

      assert.ok(mockSessions.has('sess_a_current')); // Current session kept
      assert.strictEqual(mockSessions.has('sess_a_other1'), false); // Other ended
      assert.ok(mockSessions.has('sess_b_current')); // User B untouched
    });
  });

  describe('7. User & Profile Ownership Isolation', () => {
    it('cannot view another user profile data', async () => {
      const resA = await request(testApp)
        .get('/api/profile')
        .set('x-test-user', USER_A_ID)
        .expect(200);

      const resB = await request(testApp)
        .get('/api/profile')
        .set('x-test-user', USER_B_ID)
        .expect(200);

      assert.strictEqual(resA.body.id, USER_A_ID);
      assert.strictEqual(resB.body.id, USER_B_ID);
      assert.notStrictEqual(resA.body.email, resB.body.email);
    });

    it('cannot view or invalidate another user sessions', async () => {
      const resA = await request(testApp)
        .get('/api/profile/sessions')
        .set('x-test-user', USER_A_ID)
        .expect(200);

      // User A only sees their own 2 sessions
      assert.strictEqual(resA.body.sessions.length, 2);

      const resB = await request(testApp)
        .get('/api/profile/sessions')
        .set('x-test-user', USER_B_ID)
        .expect(200);

      // User B only sees their 1 session
      assert.strictEqual(resB.body.sessions.length, 1);
    });
  });
});
