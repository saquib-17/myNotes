import dotenv from 'dotenv';
dotenv.config();

import supertest from 'supertest';
import app from '../src/app.js';
import { query, closePool } from '../src/db/pool.js';
import { closeSessionStore } from '../src/auth/sessionStore.js';

async function runLiveCheck() {
  console.log('[Live Check] Starting live database integration check...');

  const tempEmail = `stage3a_temp_${Date.now()}@example.com`;
  const tempPass = 'TempStage3APassword15Chars!';
  let createdUserId = null;

  try {
    const agent = supertest.agent(app);

    // 1. Fetch CSRF token and anonymous session
    console.log('[Live Check] 1. Requesting CSRF token (GET /api/auth/csrf)...');
    const csrfRes = await agent
      .get('/api/auth/csrf')
      .expect(200);

    if (!csrfRes.body.csrfToken || csrfRes.body.csrfToken.length !== 64) {
      throw new Error('CSRF token format verification failed');
    }
    const csrfToken = csrfRes.body.csrfToken;
    console.log('[Live Check] -> CSRF token received successfully.');

    // 2. Register temporary user
    console.log('[Live Check] 2. Registering temporary user (POST /api/auth/register)...');
    const regRes = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: tempEmail, password: tempPass })
      .expect(201);

    createdUserId = regRes.body.user.id;
    console.log(`[Live Check] -> User registered successfully (id=${createdUserId}).`);

    // 3. Login with registered user
    console.log('[Live Check] 3. Logging in with credentials (POST /api/auth/login)...');
    const loginRes = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: tempEmail, password: tempPass })
      .expect(200);

    if (loginRes.body.user.id !== createdUserId) {
      throw new Error('User ID mismatch in login response');
    }
    const postLoginCsrf = loginRes.body.csrfToken;
    console.log('[Live Check] -> Login succeeded. Session regenerated.');

    // 4. Verify /me while authenticated
    console.log('[Live Check] 4. Fetching current user (GET /api/auth/me)...');
    const meRes = await agent
      .get('/api/auth/me')
      .expect(200);

    if (meRes.body.user.id !== createdUserId) {
      throw new Error('User ID mismatch in /me response');
    }
    console.log('[Live Check] -> /me returned authenticated profile successfully.');

    // 5. Verify PostgreSQL session table persistence
    console.log('[Live Check] 5. Inspecting PostgreSQL session table persistence...');
    const sessionCountRes = await query('SELECT count(*) AS count FROM "session";');
    const sessionCount = parseInt(sessionCountRes.rows[0].count, 10);
    if (sessionCount < 1) {
      throw new Error('Expected at least 1 persisted session in "session" table');
    }
    console.log(`[Live Check] -> Confirmed session row persisted in database (active sessions: ${sessionCount}).`);

    // 6. Logout
    console.log('[Live Check] 6. Logging out (POST /api/auth/logout)...');
    await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', postLoginCsrf)
      .expect(204);
    console.log('[Live Check] -> Logout succeeded.');

    // 7. Verify /me after logout returns 401
    console.log('[Live Check] 7. Verifying /me after logout...');
    await agent
      .get('/api/auth/me')
      .expect(401);
    console.log('[Live Check] -> Unauthenticated /me returned 401 Unauthorized.');

    console.log('\n[Live Check SUCCESS] All authentication and session persistence steps verified successfully.');
  } finally {
    // Clean up temporary user and any associated sessions
    if (createdUserId) {
      console.log(`[Live Check Cleanup] Removing temporary user ${createdUserId}...`);
      await query('DELETE FROM users WHERE id = $1;', [createdUserId]);
      console.log('[Live Check Cleanup] Temporary user cleaned up cleanly.');
    }
    await closeSessionStore();
    await closePool();
  }
}

runLiveCheck();
