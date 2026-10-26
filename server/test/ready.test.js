import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getDbConfig } from '../src/config/db.config.js';

describe('Readiness and Database Foundation Tests', () => {
  describe('GET /api/ready endpoint', () => {
    it('returns 200 OK and ready status when database readiness check succeeds', async () => {
      const app = createApp({
        checkReadiness: async () => true,
      });

      const res = await request(app)
        .get('/api/ready')
        .expect(200)
        .expect('Content-Type', /json/);

      assert.deepStrictEqual(res.body, {
        status: 'ready',
        database: 'connected',
      });
    });

    it('returns 503 Service Unavailable when database readiness check returns false', async () => {
      const app = createApp({
        checkReadiness: async () => false,
      });

      const res = await request(app)
        .get('/api/ready')
        .expect(503)
        .expect('Content-Type', /json/);

      assert.deepStrictEqual(res.body, {
        status: 'unavailable',
        message: 'Service is not ready',
      });
    });

    it('returns 503 Service Unavailable and generic payload when database check throws an error', async () => {
      const app = createApp({
        checkReadiness: async () => {
          throw new Error('Connection refused to sensitive internal host:5432 with password secret123');
        },
      });

      const res = await request(app)
        .get('/api/ready')
        .expect(503)
        .expect('Content-Type', /json/);

      // Verify no leak of database internal errors, passwords, hosts, or stack traces
      assert.deepStrictEqual(res.body, {
        status: 'unavailable',
        message: 'Service is not ready',
      });
      assert.strictEqual(res.body.stack, undefined);
      assert.strictEqual(res.body.error, undefined);
    });
  });

  describe('Database Configuration Validation', () => {
    it('throws descriptive error when required environment variables are missing', () => {
      const originalEnv = { ...process.env };
      delete process.env.PGHOST;
      delete process.env.PGPASSWORD;

      assert.throws(
        () => getDbConfig(),
        /Missing required environment variable\(s\):/
      );

      // Restore
      process.env = originalEnv;
    });

    it('throws error when port is invalid or out of range', () => {
      const originalEnv = { ...process.env };
      process.env.PGHOST = 'localhost';
      process.env.PGPORT = 'invalid-port';
      process.env.PGDATABASE = 'mynotes_dev';
      process.env.PGUSER = 'mynotes_app';
      process.env.PGPASSWORD = 'dummy';

      assert.throws(
        () => getDbConfig(),
        /PGPORT must be a valid port number/
      );

      // Restore
      process.env = originalEnv;
    });

    it('returns valid config object with finite timeouts when variables are defined', () => {
      const originalEnv = { ...process.env };
      process.env.PGHOST = 'localhost';
      process.env.PGPORT = '5432';
      process.env.PGDATABASE = 'mynotes_dev';
      process.env.PGUSER = 'mynotes_app';
      process.env.PGPASSWORD = 'dummy_password';

      const config = getDbConfig();
      assert.strictEqual(config.host, 'localhost');
      assert.strictEqual(config.port, 5432);
      assert.strictEqual(config.database, 'mynotes_dev');
      assert.strictEqual(config.user, 'mynotes_app');
      assert.strictEqual(config.password, 'dummy_password');
      assert.strictEqual(config.connectionTimeoutMillis, 5000);
      assert.strictEqual(config.idleTimeoutMillis, 30000);

      // Restore
      process.env = originalEnv;
    });
  });
});
