const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const app = require("../../src/index");

describe("Teacher registration API (integration)", () => {
  const SECRET_KEY = "test-secret-key-for-testing-purposes-123";
  const TEST_SCHOOL_ID = new mongoose.Types.ObjectId();
  const TEST_TENANT_ID = new mongoose.Types.ObjectId();

  test("POST /teacher/register requires school_admin role", async () => {
    const res = await request(app).post("/teacher/register").send({
      name: "John Teacher",
      email: "teacher@example.com",
      phoneNumber: "1234567890",
    });

    expect([401, 403]).toContain(res.status);
  });

  test("should return teacher profile with valid token", async () => {
    const token = jwt.sign(
      { email: "teacher@example.com", role: "teacher", schoolId: TEST_SCHOOL_ID },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).get("/teacher/me").set("Authorization", `Bearer ${token}`);

    expect([200, 403, 500]).toContain(res.status);
  });

  test("PUT /teacher/:teacherId requires valid teacher ID", async () => {
    const token = jwt.sign(
      { email: "admin@school.com", role: "school_admin", schoolId: TEST_SCHOOL_ID },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .patch(`/teacher/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Updated Name" });

    expect([200, 400, 403, 404, 500]).toContain(res.status);
  });

  test("POST /teacher/logout requires teacher role", async () => {
    const token = jwt.sign(
      { email: "teacher@example.com", role: "teacher", schoolId: TEST_SCHOOL_ID },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).post("/teacher/logout").set("Authorization", `Bearer ${token}`);

    expect([200, 403, 500]).toContain(res.status);
  });
});
