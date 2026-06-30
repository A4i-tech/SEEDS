const request = require("supertest");
const app = require("../../src/index");

describe('GET /health/ping', () => {
  it('returns 200 with empty body', async () => {
    const res = await request(app).get('/health/ping');
    expect(res.status).toBe(200);
    expect(res.text).toBe("");
  });
});
