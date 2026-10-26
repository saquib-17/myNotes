import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

describe('Backend Foundation Endpoints', () => {
  it('GET /api/health returns 200 OK and expected process health JSON', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect(200)
      .expect('Content-Type', /json/);

    assert.deepStrictEqual(res.body, {
      status: 'ok',
      service: 'mynotes-api',
    });
  });

  it('GET unknown /api route returns 404 Not Found with JSON error payload', async () => {
    const res = await request(app)
      .get('/api/nonexistent-route')
      .expect(404)
      .expect('Content-Type', /json/);

    assert.strictEqual(res.body.error, 'Not Found');
    assert.match(res.body.message, /nonexistent-route/);
  });

  it('POST unknown /api route returns 404 Not Found with JSON error payload', async () => {
    const res = await request(app)
      .post('/api/unknown/resource')
      .send({ some: 'data' })
      .expect(404)
      .expect('Content-Type', /json/);

    assert.strictEqual(res.body.error, 'Not Found');
  });
});
