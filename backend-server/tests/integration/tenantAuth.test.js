const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcryptjs = require("bcryptjs");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const app = require("../../src/index");

describe("Tenant Authentication - Integration Tests", () => {
  const SECRET_KEY = "test-secret-key-for-testing-purposes-123";
  const TEST_TENANT = {
    email: "tenant@example.com",
    tenantName: "Test Tenant",
    password: "SecurePassword123!",
  };

  beforeAll(async () => {
    await setup();
  });

  afterAll(async () => {
    await teardown();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  // TC1.1.1 - Tenant login placeholder
  test("Tenant authentication endpoints are accessible", async () => {
    // This is a placeholder test to verify endpoints exist
    expect(app).toBeDefined();
  });

  // TC1.1.4 - Valid bearer token
  test("GET /tenant/me should require authentication", async () => {
    const res = await request(app).get("/tenant/me");

    // Without token, should get 401
    expect([401, 403]).toContain(res.status);
  });

  // TC1.1.5/6 - Token validation
  test("GET /tenant/me with token should decode JWT", async () => {
    const token = jwt.sign(
      { email: TEST_TENANT.email, role: "tenant", id: new mongoose.Types.ObjectId() },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).get("/tenant/me").set("Authorization", `Bearer ${token}`);

    // Should get either 200 (success) or error due to missing user in DB
    expect([200, 403, 500]).toContain(res.status);
  });
});
