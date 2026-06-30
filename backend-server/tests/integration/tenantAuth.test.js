const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcryptjs = require("bcryptjs");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const app = require("../../src/index");
const Tenant = require("../../src/models/Tenant");

const SECRET_KEY = process.env.SECRET_KEY;

describe("Tenant Authentication - Integration Tests", () => {
  const TEST_TENANT = {
    email: "tenant@example.com",
    tenantName: "Test Tenant",
    password: "SecurePassword123!",
  };

  beforeAll(setup);
  afterAll(teardown);
  beforeEach(clearDatabase);

  test("GET /tenant/me returns 401 without token", async () => {
    const res = await request(app).get("/tenant/me");
    expect(res.status).toBe(401);
  });

  test("GET /tenant/me returns 404 when tenant does not exist in DB", async () => {
    const token = jwt.sign(
      { email: TEST_TENANT.email, role: "tenant", id: new mongoose.Types.ObjectId(), iss: "tenant" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).get("/tenant/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test("GET /tenant/me returns 200 when tenant exists", async () => {
    const hashedPassword = await bcryptjs.hash(TEST_TENANT.password, 10);
    const tenant = await Tenant.create({
      email: TEST_TENANT.email,
      password: hashedPassword,
      tenantName: TEST_TENANT.tenantName,
    });

    const token = jwt.sign(
      { email: TEST_TENANT.email, role: "tenant", id: tenant._id.toString(), iss: "tenant" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).get("/tenant/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(TEST_TENANT.email);
    expect(res.body.tenantName).toBe(TEST_TENANT.tenantName);
  });

});
