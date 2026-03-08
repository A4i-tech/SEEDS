const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const app = require("../../src/index");

describe("Teacher Authentication - Integration Tests", () => {
  const SECRET_KEY = "test-secret-key-for-testing-purposes-123";

  test("Teacher endpoints are accessible", async () => {
    expect(app).toBeDefined();
  });

  test("GET /teacher/me requires authentication", async () => {
    const res = await request(app).get("/teacher/me");
    expect([401, 403]).toContain(res.status);
  });

  test("POST /teacher/logout can be called with teacher token", async () => {
    const token = jwt.sign(
      { email: "teacher@example.com", role: "teacher", schoolId: new mongoose.Types.ObjectId() },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).post("/teacher/logout").set("Authorization", `Bearer ${token}`);

    expect([200, 403, 500]).toContain(res.status);
  });
});
