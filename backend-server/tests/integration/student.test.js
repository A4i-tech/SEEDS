const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const app = require("../../src/index");

const SECRET_KEY = process.env.SECRET_KEY;

describe("Student Management - Integration Tests", () => {
  beforeAll(setup);
  afterAll(teardown);
  beforeEach(clearDatabase);

  test("POST /student returns 401 without token", async () => {
    const res = await request(app)
      .post("/student")
      .send({ name: "Student", phoneNumber: "1234567890" });

    expect(res.status).toBe(401);
  });

  test("POST /student returns 403 with teacher token (requires school_admin)", async () => {
    const token = jwt.sign(
      {
        email: "teacher@school.com",
        role: "teacher",
        schoolId: new mongoose.Types.ObjectId(),
        tenantId: new mongoose.Types.ObjectId(),
        iss: "teacher",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/student")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Student", phoneNumber: "1234567890" });

    expect(res.status).toBe(403);
  });

  test("POST /student returns 201 with school_admin token and valid data", async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      {
        id: schoolId.toString(),
        email: "admin@school.com",
        role: "school_admin",
        schoolId: schoolId.toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        iss: "school_admin",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/student")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Student", phoneNumber: "1234567890" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test Student");
  });

  test("GET /student returns 401 without token", async () => {
    const res = await request(app).get("/student");
    expect(res.status).toBe(401);
  });
});
