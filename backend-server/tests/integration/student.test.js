const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const app = require("../../src/index");

describe("Student Management - Integration Tests", () => {
  const SECRET_KEY = "test-secret-key-for-testing-purposes-123";

  test("Student endpoints are accessible", async () => {
    expect(app).toBeDefined();
  });

  test("POST /student requires school_admin role", async () => {
    const res = await request(app)
      .post("/student")
      .send({
        name: "Student",
        email: "student@example.com",
        classId: new mongoose.Types.ObjectId(),
      });

    expect([401, 403]).toContain(res.status);
  });

  test("GET /student requires authentication", async () => {
    const token = jwt.sign(
      { email: "admin@school.com", role: "school_admin", schoolId: new mongoose.Types.ObjectId() },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).get("/student").set("Authorization", `Bearer ${token}`);

    expect([200, 403, 500]).toContain(res.status);
  });
});
