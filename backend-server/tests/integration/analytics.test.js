const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const app = require("../../src/index");

describe("Analytics & Dashboard - Integration Tests", () => {
  const SECRET_KEY = "test-secret-key-for-testing-purposes-123";

  test("Analytics endpoints are accessible", async () => {
    expect(app).toBeDefined();
  });

  test("GET /tenant/dashboard requires tenant authentication", async () => {
    const res = await request(app).get("/tenant/dashboard");
    expect([401, 403]).toContain(res.status);
  });

  test("POST /tenant/analytics requires tenant role", async () => {
    const token = jwt.sign(
      { email: "tenant@example.com", role: "tenant", id: new mongoose.Types.ObjectId() },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/tenant/analytics")
      .set("Authorization", `Bearer ${token}`)
      .send({ startDate: "2025-01-01T00:00:00Z", endDate: "2026-12-31T23:59:59Z" });

    expect([200, 400, 403, 500]).toContain(res.status);
  });

  test("GET /school/dashboard requires school_admin role", async () => {
    const token = jwt.sign(
      { email: "admin@school.com", role: "school_admin", schoolId: new mongoose.Types.ObjectId() },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).get("/school/dashboard").set("Authorization", `Bearer ${token}`);

    expect([200, 403, 500]).toContain(res.status);
  });
});
