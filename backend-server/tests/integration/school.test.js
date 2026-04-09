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
      .post("/school")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test School", email: "school@example.com", password: "SecurePass123!" });

    expect(res.status).toBe(403);
  });

  test("POST /school returns 201 with valid tenant token and data", async () => {
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

  test("GET /school returns 401 without token", async () => {
    const res = await request(app).get("/school");
    expect(res.status).toBe(401);
  });

  test("GET /school returns 200 with school_admin token", async () => {
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

    const res = await request(app).get("/school").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("GET /school returns 200 with valid tenant token", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      { email: "tenant@example.com", role: "tenant", id: tenantId, iss: "tenant" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app).get("/school").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("GET /school/:schoolId returns 401 without token", async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/school/${schoolId}`);
    expect(res.status).toBe(401);
  });

  test("GET /school/:schoolId returns 403 with school_admin token (requires tenant)", async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      {
        email: "admin@school.com",
        role: "school_admin",
        schoolId,
        tenantId: new mongoose.Types.ObjectId(),
        iss: "school_admin",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get(`/school/${schoolId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test("GET /school/:schoolId returns 404 with valid tenant token but non-existent school", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const nonExistentSchoolId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      { email: "tenant@example.com", role: "tenant", id: tenantId, iss: "tenant" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get(`/school/${nonExistentSchoolId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test("DELETE /school/:schoolId returns 401 without token", async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const res = await request(app).delete(`/school/${schoolId}`);
    expect(res.status).toBe(401);
  });

  test("DELETE /school/:schoolId returns 403 with school_admin token (requires tenant)", async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      {
        email: "admin@school.com",
        role: "school_admin",
        schoolId,
        tenantId: new mongoose.Types.ObjectId(),
        iss: "school_admin",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .delete(`/school/${schoolId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test("DELETE /school/:schoolId returns 404 with valid tenant token but non-existent school", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const nonExistentSchoolId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      { email: "tenant@example.com", role: "tenant", id: tenantId, iss: "tenant" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .delete(`/school/${nonExistentSchoolId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test("POST /school/analytics returns 401 without token", async () => {
    const res = await request(app)
      .post("/school/analytics")
      .send({ startDate: "2025-01-01T00:00:00Z", endDate: "2026-12-31T23:59:59Z" });

    expect(res.status).toBe(401);
  });

  test("POST /school/analytics returns 403 with tenant token (requires school_admin)", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      { email: "tenant@example.com", role: "tenant", id: tenantId, iss: "tenant" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/school/analytics")
      .set("Authorization", `Bearer ${token}`)
      .send({ startDate: "2025-01-01T00:00:00Z", endDate: "2026-12-31T23:59:59Z" });

    expect(res.status).toBe(403);
  });

  test("POST /school/analytics returns 200 with valid school_admin token", async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      {
        email: "admin@school.com",
        role: "school_admin",
        schoolId,
        tenantId: new mongoose.Types.ObjectId(),
        iss: "school_admin",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/school/analytics")
      .set("Authorization", `Bearer ${token}`)
      .send({ startDate: "2025-01-01T00:00:00Z", endDate: "2026-12-31T23:59:59Z" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("startDate");
    expect(res.body).toHaveProperty("endDate");
  });

  test("POST /school/transfer returns 401 without token", async () => {
    const res = await request(app)
      .post("/school/transfer")
      .send({
        teacherId: new mongoose.Types.ObjectId(),
        targetSchoolId: new mongoose.Types.ObjectId(),
      });

    expect(res.status).toBe(401);
  });

  test("POST /school/transfer returns 403 with tenant token (requires school_admin)", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      { email: "tenant@example.com", role: "tenant", id: tenantId, iss: "tenant" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/school/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({
        teacherId: new mongoose.Types.ObjectId(),
        targetSchoolId: new mongoose.Types.ObjectId(),
      });

    expect(res.status).toBe(403);
  });

  test("POST /school/transfer returns 400 with school_admin token but missing required fields", async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      {
        email: "admin@school.com",
        role: "school_admin",
        schoolId,
        tenantId: new mongoose.Types.ObjectId(),
        iss: "school_admin",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/school/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ teacherId: new mongoose.Types.ObjectId() }); // Missing targetSchoolId

    expect(res.status).toBe(400);
  });
});
