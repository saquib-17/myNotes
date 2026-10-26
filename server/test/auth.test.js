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
