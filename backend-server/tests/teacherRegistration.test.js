process.env.AUTH_TYPE = "native";
process.env.SECRET_KEY = "test-secret-key-for-testing-purposes-123";

process.env.AZURE_STORAGE_ACCOUNT_NAME = "mockaccountname";
process.env.AZURE_STORAGE_ACCOUNT_KEY = "mockkeymockkeymockkeymockkeymockkeymockkeymockkeymockkey";

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
const app = require("../src/index");
const mongoose = require("mongoose");
const Tenant = require("../src/models/Tenant");
const Teacher = require("../src/models/Teacher");
const { MongoMemoryServer } = require("mongodb-memory-server");

const STATUS_OK = 200;
const STATUS_CREATED = 201;
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_CONFLICT = 409;

const TEST_EMAIL = "testtenant@example.com";
const TEST_PHONE = "1234567890";
const TEST_PASSWORD = "TestPassword123!";
const TEST_TENANT_NAME = "Test Tenant";
const TEST_TEACHER_NAME = "Test Teacher";

let mongoServer;

async function createTenantAndToken() {
  const tenant = await Tenant.create({
    email: TEST_EMAIL,
    password: "hashedplaceholder",
    tenantName: TEST_TENANT_NAME,
  });
  const token = jwt.sign({ id: tenant._id.toString() });
  return { tenant, token };
}

describe("Teacher registration API", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await Tenant.deleteMany({});
    await Teacher.deleteMany({});
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    process.env.AUTH_TYPE = "native";
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  });

  test("register fails without Authorization token", async () => {
    const res = await request(app)
      .post("/teacher/register")
      .send({
        phoneNumber: TEST_PHONE,
        password: TEST_PASSWORD,
        name: TEST_TEACHER_NAME,
      });
    expect(res.statusCode).toBe(STATUS_UNAUTHORIZED);
  });

  test("register fails with missing name", async () => {
    const { token } = await createTenantAndToken();
    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        phoneNumber: TEST_PHONE,
        password: TEST_PASSWORD,
      });
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
    expect(res.body.message && res.body.message.toLowerCase().includes("name")).toBe(true);
  });

  test("register fails with empty string name", async () => {
    const { token } = await createTenantAndToken();
    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        phoneNumber: TEST_PHONE,
        password: TEST_PASSWORD,
        name: "",
      });
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
  });

  test("register fails with whitespace-only name", async () => {
    const { token } = await createTenantAndToken();
    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        phoneNumber: TEST_PHONE,
        password: TEST_PASSWORD,
        name: "   \t  ",
      });
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
  });

  test("register fails with invalid phone number format", async () => {
    const { token } = await createTenantAndToken();
    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        phoneNumber: "not-a-phone",
        password: TEST_PASSWORD,
        name: TEST_TEACHER_NAME,
      });
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
    expect(res.body.message && res.body.message.toLowerCase().includes("phone")).toBe(true);
  });

  test("register fails with weak password", async () => {
    const { token } = await createTenantAndToken();
    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        phoneNumber: TEST_PHONE,
        password: "weak",
        name: TEST_TEACHER_NAME,
      });
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
    expect(res.body.message && res.body.message.toLowerCase().includes("password")).toBe(true);
  });

  test("register succeeds with valid name, phone, and password and stores name", async () => {
    const { token } = await createTenantAndToken();
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
    }).lean();
    expect(teacher).toBeDefined();
    expect(teacher.name).toBe(TEST_TEACHER_NAME);
  });

  test("register trims name and stores trimmed value", async () => {
    const { token } = await createTenantAndToken();
    const nameWithSpaces = "  Trimmed Teacher  ";
    const res = await request(app)
      .post("/teacher/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        phoneNumber: "9876543210",
        password: TEST_PASSWORD,
        name: nameWithSpaces,
      });
    expect(res.statusCode).toBe(STATUS_CREATED);

    const teacher = await Teacher.findOne({
      phoneNumber: "9876543210",
    }).lean();
    expect(teacher).toBeDefined();
    expect(teacher.name).toBe("Trimmed Teacher");
  });

  test("register fails when phone number already in use for tenant", async () => {
    const { token, tenant } = await createTenantAndToken();
    await Teacher.create({
      tenantId: tenant._id.toString(),
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
