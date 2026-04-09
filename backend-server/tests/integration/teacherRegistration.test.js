const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../../src/index");
const Tenant = require("../../src/models/Tenant");
const School = require("../../src/models/School");
const Teacher = require("../../src/models/Teacher");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const SECRET_KEY = process.env.SECRET_KEY;

const STATUS_CREATED = 201;
const STATUS_CONFLICT = 409;

const TEST_TENANT_EMAIL = "testtenant@example.com";
const TEST_SCHOOL_EMAIL = "testschool@example.com";
const TEST_PHONE = "1234567890";
const TEST_PASSWORD = "TestPassword123!";
const TEST_TENANT_NAME = "Test Tenant";
const TEST_SCHOOL_NAME = "Test School";
const TEST_TEACHER_NAME = "Test Teacher";

async function createSchoolAndToken() {
  const tenant = await Tenant.create({
    email: TEST_TENANT_EMAIL,
    password: "hashedplaceholder",
    tenantName: TEST_TENANT_NAME,
  });
  const school = await School.create({
    tenantId: tenant._id.toString(),
    name: TEST_SCHOOL_NAME,
    email: TEST_SCHOOL_EMAIL,
    password: "hashedplaceholder",
  });
  const token = jwt.sign(
    {
      id: school._id.toString(),
      role: "school_admin",
      schoolId: school._id.toString(),
      tenantId: tenant._id.toString(),
      iss: "school_admin",
    },
    SECRET_KEY,
    { expiresIn: "1h" }
  );
  return { tenant, school, token };
}

describe("Teacher registration API (integration)", () => {
  beforeAll(setup);
  afterAll(teardown);
  beforeEach(clearDatabase);

  test("POST /teacher/register returns 401 without token", async () => {
    const res = await request(app).post("/teacher/register").send({
      name: "John Teacher",
      phoneNumber: "1234567890",
      password: TEST_PASSWORD,
      role: "teacher",
    });

    expect(res.status).toBe(401);
  });

  test("POST /teacher/register returns 403 with teacher token", async () => {
    const token = jwt.sign(
      {
        email: "teacher@example.com",
        role: "teacher",
        schoolId: new mongoose.Types.ObjectId(),
        tenantId: new mongoose.Types.ObjectId(),
        iss: "teacher",
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Teacher",
        phoneNumber: "1234567890",
        password: TEST_PASSWORD,
        role: "teacher",
      });

    expect(res.status).toBe(403);
  });

  test("register succeeds with valid name, phone, and password and stores name", async () => {
    const { token, school } = await createSchoolAndToken();
    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        phoneNumber: TEST_PHONE,
        password: TEST_PASSWORD,
        name: TEST_TEACHER_NAME,
        role: "teacher",
      });

    expect(res.statusCode).toBe(STATUS_CREATED);
    expect(res.body.message).toBeDefined();

    const teacher = await Teacher.findOne({
      phoneNumber: TEST_PHONE,
      schoolId: school._id.toString(),
    }).lean();
    expect(teacher).toBeDefined();
    expect(teacher.name).toBe(TEST_TEACHER_NAME);
  });

  test("register fails when phone number already in use for school", async () => {
    const { token, school } = await createSchoolAndToken();
    await Teacher.create({
      schoolId: school._id.toString(),
      phoneNumber: TEST_PHONE,
      password: "alreadyhashed",
      name: "Existing Teacher",
    });

    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        phoneNumber: TEST_PHONE,
        password: TEST_PASSWORD,
        name: "Another Teacher",
        role: "teacher",
      });

    expect(res.statusCode).toBe(STATUS_CONFLICT);
    expect(res.body.message.toLowerCase()).toContain("phone");
  });
});
