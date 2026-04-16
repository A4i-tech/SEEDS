process.env.AUTH_TYPE = "native";
process.env.SECRET_KEY = "test-secret-key-for-testing-purposes-123";

const bcrypt = require("bcryptjs");
const teacherAuth = require("../../src/auth/teacher/teacherAuthProviderMiddleware");
const dbAdapter = require("../../src/auth/dbAdapters/nativeDb");

const STATUS_BAD_REQUEST = 400;
const STATUS_OK = 200;

const TEST_PHONE = "1234567890";
const TEST_PASSWORD = "TestPassword123!";
const TEST_TENANT_ID = "tenant123";

function getMockReq(body) {
  return { body };
}

function getMockRes() {
  const res = {};
  res.statusCode = null;
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.json = function (obj) {
    this.body = obj;
    return this;
  };
  return res;
}

describe("Teacher login - phone fallback (unit)", () => {
  test("login fails when phone or password is missing", async () => {
    const req = getMockReq({ phoneNumber: TEST_PHONE });
    const res = getMockRes();
    await teacherAuth.login(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
    expect(res.body.message.toLowerCase()).toContain("phone number and password");
  });

  test("login succeeds with phone and password without tenantId", async () => {
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

    jest.spyOn(dbAdapter, "getTeacherByPhoneNumber").mockResolvedValue({
      _id: "teacher123",
      phoneNumber: TEST_PHONE,
      tenantId: TEST_TENANT_ID,
      name: "Teacher User",
      password: hashedPassword,
      role: "teacher",
    });

    const req = getMockReq({ phoneNumber: TEST_PHONE, password: TEST_PASSWORD });
    const res = getMockRes();

    await teacherAuth.login(req, res);

    expect(dbAdapter.getTeacherByPhoneNumber).toHaveBeenCalledWith(TEST_PHONE);
    expect(res.statusCode).toBe(STATUS_OK);
    expect(res.body.token).toBeDefined();
    expect(res.body.phoneNumber).toBe(TEST_PHONE);
    expect(res.body.tenantId).toBe(TEST_TENANT_ID);
    expect(res.body.role).toBe("teacher");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
