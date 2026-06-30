const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const app = require("../../src/index");

const SECRET_KEY = process.env.SECRET_KEY;

describe("Analytics & Dashboard - Integration Tests", () => {
  beforeAll(setup);
  afterAll(teardown);
  beforeEach(clearDatabase);

  test("GET /tenant/dashboard returns 401 without token", async () => {
    const res = await request(app).get("/tenant/dashboard");
    expect(res.status).toBe(401);
  });

  test("POST /tenant/analytics returns 200 with valid tenant token and dates", async () => {
    const token = jwt.sign(
      {
        email: "tenant@example.com",
        role: "tenant",
        id: new mongoose.Types.ObjectId(),
        iss: "tenant",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/tenant/analytics")
      .set("Authorization", `Bearer ${token}`)
      .send({ startDate: "2025-01-01T00:00:00Z", endDate: "2026-12-31T23:59:59Z" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("startDate", "2025-01-01T00:00:00Z");
    expect(res.body).toHaveProperty("endDate", "2026-12-31T23:59:59Z");
    expect(res.body).toHaveProperty("count");
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("POST /tenant/analytics returns 403 with school_admin token", async () => {
    const token = jwt.sign(
      {
        email: "admin@school.com",
        role: "school_admin",
        schoolId: new mongoose.Types.ObjectId(),
        tenantId: new mongoose.Types.ObjectId(),
        iss: "school_admin",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/tenant/analytics")
      .set("Authorization", `Bearer ${token}`)
      .send({ startDate: "2025-01-01T00:00:00Z", endDate: "2026-12-31T23:59:59Z" });

    expect(res.status).toBe(403);
  });

  test("GET /school/dashboard returns 403 with tenant token", async () => {
    const token = jwt.sign(
      {
        email: "tenant@example.com",
        role: "tenant",
        id: new mongoose.Types.ObjectId(),
        iss: "tenant",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).get("/school/dashboard").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
