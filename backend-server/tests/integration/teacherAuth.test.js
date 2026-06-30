const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const app = require("../../src/index");

const SECRET_KEY = process.env.SECRET_KEY;

describe("Teacher Authentication - Integration Tests", () => {
  beforeAll(setup);
  afterAll(teardown);
  beforeEach(clearDatabase);

  test("GET /teacher/me returns 401 without token", async () => {
    const res = await request(app).get("/teacher/me");
    expect(res.status).toBe(401);
  });

  test("GET /teacher/me returns 403 with non-teacher token", async () => {
    const token = jwt.sign(
      { email: "tenant@example.com", role: "tenant", id: new mongoose.Types.ObjectId(), iss: "tenant" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).get("/teacher/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("POST /teacher/logout returns 401 without token", async () => {
    const res = await request(app).post("/teacher/logout");
    expect(res.status).toBe(401);
  });
});
