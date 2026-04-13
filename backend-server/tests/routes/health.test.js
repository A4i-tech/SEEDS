const request = require("supertest");
const app = require("../../src/index");

describe('GET /health/ping', () => {
  it('returns 200 with empty body', async () => {
    const res = await request(app).get('/health/ping');
    expect(res.status).toBe(200);
    expect(res.text).toBe("");
  });

  it('responds quickly (under 200ms)', async () => {
    const start = Date.now();
    await request(app).get('/health/ping');
    expect(Date.now() - start).toBeLessThan(50);
  });
});
