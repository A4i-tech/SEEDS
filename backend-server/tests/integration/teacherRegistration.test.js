jest.mock("jsonwebtoken", () => ({
  sign: (payload) => `mock-${Buffer.from(JSON.stringify(payload)).toString("base64url")}`,
  verify: (token, _secret, callback) => {
    if (typeof _secret === "function") {
      callback = _secret;
    }
    if (token && String(token).startsWith("mock-")) {
      const encodedPayload = String(token).slice(5);
      const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
      return callback(null, payload);
    }
    return callback(new Error("invalid token"));
  },
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/index");
const Tenant = require("../../src/models/Tenant");
const Teacher = require("../../src/models/Teacher");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const STATUS_CREATED = 201;
const STATUS_UNAUTHORIZED = 401;
const STATUS_CONFLICT = 409;

const TEST_EMAIL = "testtenant@example.com";
const TEST_PHONE = "1234567890";
const TEST_PASSWORD = "TestPassword123!";
const TEST_TENANT_NAME = "Test Tenant";
const TEST_TEACHER_NAME = "Test Teacher";
const TEST_ROLE = "teacher";

async function createTenantAndToken() {
  const tenant = await Tenant.create({
    email: TEST_EMAIL,
    password: "hashedplaceholder",
    tenantName: TEST_TENANT_NAME,
  });
  const token = jwt.sign({ id: tenant._id.toString(), role: "tenant" });
  return { tenant, token };
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
      role: TEST_ROLE,
    });
    expect(res.statusCode).toBe(STATUS_UNAUTHORIZED);
  });

  test("register succeeds with valid name, phone, and password and stores name", async () => {
    const { token, tenant } = await createTenantAndToken();
    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        phoneNumber: TEST_PHONE,
        password: TEST_PASSWORD,
        name: TEST_TEACHER_NAME,
        role: TEST_ROLE,
      });
    expect(res.statusCode).toBe(STATUS_CREATED);
    expect(res.body.message).toBeDefined();

    const teacher = await Teacher.findOne({
      phoneNumber: TEST_PHONE,
      tenantId: tenant._id.toString(),
    }).lean();
    expect(teacher).toBeDefined();
    expect(teacher.name).toBe(TEST_TEACHER_NAME);
  });

  test("register fails when phone number already in use for tenant", async () => {
    const { token, tenant } = await createTenantAndToken();
    await Teacher.create({
      tenantId: tenant._id.toString(),
      phoneNumber: TEST_PHONE,
      password: "alreadyhashed",
      name: "Existing Teacher",
      role: TEST_ROLE,
    });

    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        phoneNumber: TEST_PHONE,
        password: TEST_PASSWORD,
        name: "Another Teacher",
        role: TEST_ROLE,
      });
    expect(res.statusCode).toBe(STATUS_CONFLICT);
    expect(res.body.message && res.body.message.toLowerCase().includes("phone")).toBe(true);
  });
});
