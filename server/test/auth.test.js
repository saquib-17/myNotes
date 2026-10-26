import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import {
  hashPassword,
  verifyPassword,
  validatePassword,
} from '../src/auth/password.js';
import { RateLimiter } from '../src/auth/rateLimiter.js';
import { DuplicateEmailError } from '../src/auth/userRepository.js';

describe('Authentication Backend Unit & Integration Tests (Isolated Seams)', () => {
  let mockUsers;
  let testApp;
  let testLoginLimiter;
  let testRegisterLimiter;

  beforeEach(() => {
    mockUsers = new Map();

    testLoginLimiter = new RateLimiter({
      windowMs: 60 * 1000,
      maxAttempts: 3,
      name: 'test-login',
    });

    testRegisterLimiter = new RateLimiter({
      windowMs: 60 * 1000,
      maxAttempts: 5,
      name: 'test-register',
    });

    const mockCreateUser = async ({ email, passwordHash }) => {
      const lower = email.trim().toLowerCase();
      for (const u of mockUsers.values()) {
        if (u.email.toLowerCase() === lower) {
          throw new DuplicateEmailError();
        }
      }
      const user = {
        id: `mock-uuid-${mockUsers.size + 1}`,
        email: lower,
        passwordHash,
        createdAt: new Date(),
      };
      mockUsers.set(user.id, user);
      return user;
    };

    const mockFindUserByEmail = async (email) => {
      const lower = email.trim().toLowerCase();
      for (const u of mockUsers.values()) {
        if (u.email.toLowerCase() === lower) {
          return u;
        }
      }
      return null;
    };

    const mockFindUserById = async (id) => {
      return mockUsers.get(id) || null;
    };

    const authRouter = createAuthRouter({
      createUserFn: mockCreateUser,
      findUserByEmailFn: mockFindUserByEmail,
      findUserByIdFn: mockFindUserById,
      customLoginLimiter: testLoginLimiter,
      customRegisterLimiter: testRegisterLimiter,
    });

    const memorySession = session({
      secret: 'test-high-entropy-session-secret-32-chars-minimum-length!',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 86400000 },
    });

    testApp = createApp({
      checkReadiness: async () => true,
      sessionMiddleware: memorySession,
      authRouter,
    });
  });

  describe('Password Validation & Argon2id Hashing', () => {
    it('validates password length policies correctly', () => {
      assert.strictEqual(validatePassword('short').valid, false);
      assert.match(validatePassword('short').error, /at least 15 characters/);
      assert.strictEqual(validatePassword(12345).valid, false);
      assert.strictEqual(validatePassword('a'.repeat(129)).valid, false);

      // Valid: spaces, unicode, >= 15 chars
      const validPass = 'Correct Horse Battery Staple! 🚀';
      assert.strictEqual(validatePassword(validPass).valid, true);
    });

    it('hashes and verifies using Argon2id with explicit OWASP parameters', async () => {
      const password = 'AValidPassword15CharsLong!';
      const hash = await hashPassword(password);

      assert.match(hash, /^\$argon2id\$/);
      assert.strictEqual(await verifyPassword(hash, password), true);
      assert.strictEqual(await verifyPassword(hash, 'WrongPassword15CharsLong!'), false);
    });
  });

  describe('CSRF & Origin Protection', () => {
    it('GET /api/auth/csrf generates and returns a CSRF token with no-store headers', async () => {
      const res = await request(testApp)
        .get('/api/auth/csrf')
        .expect(200);

      assert.strictEqual(typeof res.body.csrfToken, 'string');
      assert.strictEqual(res.body.csrfToken.length, 64);
      assert.match(res.headers['cache-control'], /no-store/);
    });

    it('rejects POST requests with missing or invalid CSRF token', async () => {
      const res = await request(testApp)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'Password15Characters!' })
        .expect(403);

      assert.strictEqual(res.body.error, 'Forbidden');
      assert.match(res.body.message, /CSRF/);
    });

    it('rejects POST requests from disallowed Origin header', async () => {
      const agent = request.agent(testApp);
      const csrfRes = await agent.get('/api/auth/csrf');
      const token = csrfRes.body.csrfToken;

      const res = await agent
        .post('/api/auth/register')
        .set('Origin', 'http://malicious-site.com')
        .set('X-CSRF-Token', token)
        .send({ email: 'test@example.com', password: 'Password15Characters!' })
        .expect(403);

      assert.strictEqual(res.body.error, 'Forbidden');
      assert.match(res.body.message, /cors|origin/i);
    });
  });

  describe('Registration Flow', () => {
    it('successfully registers a user with valid email and password', async () => {
      const agent = request.agent(testApp);
      const csrfRes = await agent.get('/api/auth/csrf');
      const token = csrfRes.body.csrfToken;

      const res = await agent
        .post('/api/auth/register')
        .set('X-CSRF-Token', token)
        .send({
          email: '  Alice@Example.com  ',
          password: 'SuperSecretPassword15Chars!',
        })
        .expect(201);

      assert.strictEqual(res.body.user.email, 'alice@example.com');
      assert.strictEqual(typeof res.body.user.id, 'string');
      assert.strictEqual(res.body.user.passwordHash, undefined);
      assert.strictEqual(res.body.user.password, undefined);
    });

    it('returns 400 for invalid email formats or short passwords', async () => {
      const agent = request.agent(testApp);
      const csrfRes = await agent.get('/api/auth/csrf');
      const token = csrfRes.body.csrfToken;

      const shortRes = await agent
        .post('/api/auth/register')
        .set('X-CSRF-Token', token)
        .send({ email: 'user@example.com', password: 'short' })
        .expect(400);

      assert.match(shortRes.body.message, /at least 15/);

      const invalidEmailRes = await agent
        .post('/api/auth/register')
        .set('X-CSRF-Token', token)
        .send({ email: 'not-an-email', password: 'ValidPassword15CharactersLong!' })
        .expect(400);

      assert.match(invalidEmailRes.body.message, /format/);
    });

    it('returns 409 Conflict when registering duplicate email address', async () => {
      const agent = request.agent(testApp);
      const csrfRes = await agent.get('/api/auth/csrf');
      const token = csrfRes.body.csrfToken;

      await agent
        .post('/api/auth/register')
        .set('X-CSRF-Token', token)
        .send({ email: 'duplicate@example.com', password: 'Password15CharactersLong!' })
        .expect(201);

      const dupRes = await agent
        .post('/api/auth/register')
        .set('X-CSRF-Token', token)
        .send({ email: 'DUPLICATE@example.com', password: 'Password15CharactersLong!' })
        .expect(409);

      assert.strictEqual(dupRes.body.error, 'Conflict');
      assert.match(dupRes.body.message, /already exists/);
    });
  });

  describe('Login, Session & Logout Lifecycle', () => {
    const userEmail = 'bob@example.com';
    const userPass = 'BobSecretPassword15Chars!';

    beforeEach(async () => {
      const hash = await hashPassword(userPass);
      mockUsers.set('user-bob', {
        id: 'user-bob',
        email: userEmail,
        passwordHash: hash,
        createdAt: new Date(),
      });
    });

    it('returns 401 with generic error on incorrect password or unknown user', async () => {
      const agent = request.agent(testApp);
      const csrfRes = await agent.get('/api/auth/csrf');
      const token = csrfRes.body.csrfToken;

      // Incorrect password
      const wrongPassRes = await agent
        .post('/api/auth/login')
        .set('X-CSRF-Token', token)
        .send({ email: userEmail, password: 'WrongPassword15CharsLong!' })
        .expect(401);

      assert.strictEqual(wrongPassRes.body.message, 'Invalid email or password.');

      // Unknown user
      const unknownUserRes = await agent
        .post('/api/auth/login')
        .set('X-CSRF-Token', token)
        .send({ email: 'nonexistent@example.com', password: 'SomePassword15Chars!' })
        .expect(401);

      assert.strictEqual(unknownUserRes.body.message, 'Invalid email or password.');
    });

    it('successfully logs in, provides authenticated session, accesses /me, and logs out', async () => {
      const agent = request.agent(testApp);
      const csrfRes = await agent.get('/api/auth/csrf');
      const initialToken = csrfRes.body.csrfToken;

      // 1. Check /me before login -> 401
      await agent.get('/api/auth/me').expect(401);

      // 2. Login
      const loginRes = await agent
        .post('/api/auth/login')
        .set('X-CSRF-Token', initialToken)
        .send({ email: '  BOB@example.com  ', password: userPass })
        .expect(200);

      assert.strictEqual(loginRes.body.user.email, userEmail);
      assert.strictEqual(loginRes.body.user.id, 'user-bob');
      assert.strictEqual(typeof loginRes.body.csrfToken, 'string');
      const postLoginToken = loginRes.body.csrfToken;

      // 3. Check /me after login -> 200 with public user
      const meRes = await agent.get('/api/auth/me').expect(200);
      assert.strictEqual(meRes.body.user.email, userEmail);
      assert.strictEqual(meRes.body.user.id, 'user-bob');

      // 4. Logout
      await agent
        .post('/api/auth/logout')
        .set('X-CSRF-Token', postLoginToken)
        .expect(204);

      // 5. Check /me after logout -> 401
      await agent.get('/api/auth/me').expect(401);
    });
  });

  describe('Rate Limiting & Abuse Prevention', () => {
    it('throttles repeated failed login attempts with HTTP 429 and Retry-After', async () => {
      const agent = request.agent(testApp);
      const csrfRes = await agent.get('/api/auth/csrf');
      const token = csrfRes.body.csrfToken;

      // Max attempts = 3
      for (let i = 0; i < 3; i++) {
        await agent
          .post('/api/auth/login')
          .set('X-CSRF-Token', token)
          .send({ email: 'bob@example.com', password: 'WrongPassword15CharsLong!' })
          .expect(401);
      }

      // 4th attempt throttled
      const throttledRes = await agent
        .post('/api/auth/login')
        .set('X-CSRF-Token', token)
        .send({ email: 'bob@example.com', password: 'WrongPassword15CharsLong!' })
        .expect(429);

      assert.strictEqual(throttledRes.body.error, 'TooManyRequests');
      assert.ok(throttledRes.headers['retry-after']);
    });
  });

  describe('Health Probes Do Not Create Sessions', () => {
    it('GET /api/health and /api/ready do not set session cookies', async () => {
      const healthRes = await request(testApp).get('/api/health').expect(200);
      assert.strictEqual(healthRes.headers['set-cookie'], undefined);

      const readyRes = await request(testApp).get('/api/ready').expect(200);
      assert.strictEqual(readyRes.headers['set-cookie'], undefined);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Session Lifetime Enforcement Tests (deterministic, no real time manipulation)
// ─────────────────────────────────────────────────────────────────────────────
import { getSessionOptions } from '../src/config/session.config.js';

describe('Session Lifetime Configuration', () => {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  it('maxAge is exactly seven days in milliseconds', () => {
    const opts = getSessionOptions({ secret: 'test-secret-minimum-32-chars-exact!', secure: false });
    assert.strictEqual(opts.cookie.maxAge, SEVEN_DAYS_MS,
      'Session cookie maxAge must be exactly 7 days (604800000 ms)');
  });

  it('rolling is false so session touch cannot extend the deadline', () => {
    const opts = getSessionOptions({ secret: 'test-secret-minimum-32-chars-exact!', secure: false });
    assert.strictEqual(opts.rolling, false,
      'rolling must be false to prevent touch/renewal from extending the 7-day deadline');
  });

  it('saveUninitialized is false so anonymous requests do not create sessions', () => {
    const opts = getSessionOptions({ secret: 'test-secret-minimum-32-chars-exact!', secure: false });
    assert.strictEqual(opts.saveUninitialized, false);
  });

  it('resave is false so unchanged sessions are not needlessly re-persisted', () => {
    const opts = getSessionOptions({ secret: 'test-secret-minimum-32-chars-exact!', secure: false });
    assert.strictEqual(opts.resave, false);
  });

  it('httpOnly is true so the session cookie is inaccessible to JavaScript', () => {
    const opts = getSessionOptions({ secret: 'test-secret-minimum-32-chars-exact!', secure: false });
    assert.strictEqual(opts.cookie.httpOnly, true);
  });

  it('sameSite is lax', () => {
    const opts = getSessionOptions({ secret: 'test-secret-minimum-32-chars-exact!', secure: false });
    assert.strictEqual(opts.cookie.sameSite, 'lax');
  });

  it('server enforces session validity: destroyed session returns 401 (simulates post-expiry state)', async () => {
    // This test simulates what the server does after a session expires:
    // it is removed from the store and subsequent requests with that cookie are rejected.
    // We reproduce this by: logging in, confirming /me works, then directly destroying the
    // session in the store (the same operation the pruner/expiry mechanism performs),
    // and confirming /me now returns 401.
    const mockUsers = new Map();
    const userPass = 'VeryLongPasswordOverFifteenChars!';
    const { hashPassword } = await import('../src/auth/password.js');
    const hash = await hashPassword(userPass);
    const userId = 'expiry-test-user-2';
    mockUsers.set(userId, {
      id: userId, email: 'expiry2@example.com', passwordHash: hash, createdAt: new Date(),
    });

    const mockFindUserByEmail = async (email) => {
      const lower = email.trim().toLowerCase();
      for (const u of mockUsers.values()) {
        if (u.email.toLowerCase() === lower) return u;
      }
      return null;
    };
    const mockFindUserById = async (id) => mockUsers.get(id) || null;

    const expiryLimiter = new RateLimiter({ windowMs: 60000, maxAttempts: 10, name: 'expiry-2' });
    const { createAuthRouter } = await import('../src/routes/auth.routes.js');
    const authRouter2 = createAuthRouter({
      findUserByEmailFn: mockFindUserByEmail,
      findUserByIdFn: mockFindUserById,
      customLoginLimiter: expiryLimiter,
      customRegisterLimiter: expiryLimiter,
    });

    // Use a normal 7-day session so the full lifecycle works without timing issues.
    // We will destroy the session manually to simulate expiry enforcement.
    const { default: sessionMiddleware } = await import('express-session');
    const MemoryStore = sessionMiddleware.MemoryStore;
    const store = new MemoryStore();
    const normalSession = sessionMiddleware({
      secret: 'test-secret-minimum-32-chars-exact!',
      resave: false,
      saveUninitialized: false,
      store,
      cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
    });

    const { createApp } = await import('../src/app.js');
    const expiryApp2 = createApp({
      checkReadiness: async () => true,
      sessionMiddleware: normalSession,
      authRouter: authRouter2,
    });

    const agent = request.agent(expiryApp2);

    // 1. Get CSRF token
    const csrfRes = await agent.get('/api/auth/csrf').expect(200);
    const token = csrfRes.body.csrfToken;

    // 2. Login
    const loginRes = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: 'expiry2@example.com', password: userPass })
      .expect(200);
    assert.ok(loginRes.body.user, 'Login must succeed');

    // 3. Confirm /me works
    await agent.get('/api/auth/me').expect(200);

    // 4. Simulate session expiry by clearing all sessions from the store.
    //    This is exactly what the prune timer does to expired sessions.
    await new Promise((resolve, reject) => {
      store.clear((err) => err ? reject(err) : resolve());
    });

    // 5. /me must now return 401 — the session no longer exists in the store.
    const meRes = await agent.get('/api/auth/me');
    assert.strictEqual(meRes.status, 401,
      'Server must return 401 when session has been removed from store (simulating post-expiry state)');
  });
});
