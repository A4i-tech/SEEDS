jest.mock("jsonwebtoken", () => ({
  sign: (payload) => `mock-${payload.id || ""}`,
  verify: (token, _secret, callback) => {
    if (typeof _secret === "function") {
      callback = _secret;
    }
    if (token && String(token).startsWith("mock-")) {
      const id = String(token).slice(5);
      return callback(null, { id });
    }
    return callback(new Error("invalid token"));
  },
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/index");
const Tenant = require("../../src/models/Tenant");
const School = require("../../src/models/School");
const Teacher = require("../../src/models/Teacher");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const STATUS_CREATED = 201;
const STATUS_UNAUTHORIZED = 401;
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
  const token = jwt.sign({ id: school._id.toString() });
  return { tenant, school, token };
}

describe("Teacher registration API (integration)", () => {
  beforeAll(setup, 30000);
  afterAll(teardown);
  beforeEach(async () => {
    await clearDatabase();
  });

  test("register fails without Authorization token", async () => {
    const res = await request(app).post("/teacher/register").send({
      phoneNumber: TEST_PHONE,
      password: TEST_PASSWORD,
      name: TEST_TEACHER_NAME,
    });
    expect(res.statusCode).toBe(STATUS_UNAUTHORIZED);
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
      });
    expect(res.statusCode).toBe(STATUS_CONFLICT);
    expect(res.body.message && res.body.message.toLowerCase().includes("phone")).toBe(true);
  });
});
