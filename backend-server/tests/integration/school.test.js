const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const app = require("../../src/index");

const SECRET_KEY = process.env.SECRET_KEY;

describe("School Management - Integration Tests", () => {
  beforeAll(setup);
  afterAll(teardown);
  beforeEach(clearDatabase);

  test("POST /school returns 401 without token", async () => {
    const res = await request(app)
      .post("/school")
      .send({ name: "Test School", email: "school@example.com", password: "SecurePass123!" });

    expect(res.status).toBe(401);
  });

  test("POST /school returns 403 with school_admin token (requires tenant)", async () => {
    const token = jwt.sign(
      { email: "admin@school.com", role: "school_admin", schoolId: new mongoose.Types.ObjectId(), iss: "school_admin" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/school")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test School", email: "school@example.com", password: "SecurePass123!" });

    expect(res.status).toBe(403);
  });

  test("POST /school returns 201 with valid tenant token and data", async () => {
    const token = jwt.sign(
      { email: "tenant@example.com", role: "tenant", id: new mongoose.Types.ObjectId(), iss: "tenant" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/school")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test School", email: "school@example.com", password: "SecurePass123!" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test School");
  });

  test("GET /school/dashboard returns 401 without token", async () => {
    const res = await request(app).get("/school/dashboard");
    expect(res.status).toBe(401);
  });
});
