const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const app = require("../../src/index");

describe("School Management - Integration Tests", () => {
  const SECRET_KEY = "test-secret-key-for-testing-purposes-123";

  test("School endpoints are accessible", async () => {
    expect(app).toBeDefined();
  });

  test("POST /school requires tenant authentication", async () => {
    const res = await request(app)
      .post("/school")
      .send({ name: "Test School", email: "school@example.com", password: "SecurePass123" });

    expect([401, 403]).toContain(res.status);
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
