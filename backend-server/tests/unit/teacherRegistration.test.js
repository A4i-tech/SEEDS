process.env.AUTH_TYPE = "native";
process.env.SECRET_KEY = "test-secret-key-for-testing-purposes-123";

const teacherAuth = require("../../src/auth/teacher/teacherAuthProviderMiddleware");

const STATUS_BAD_REQUEST = 400;

const TEST_PHONE = "1234567890";
const TEST_PASSWORD = "TestPassword123!";
const TEST_TEACHER_NAME = "Test Teacher";
const TEST_TENANT_ID = "tenant123";

function getMockReq(body, userId = TEST_TENANT_ID) {
  return { body, userId };
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

describe("Teacher registration - input validation (unit)", () => {
  test("register fails with missing name", async () => {
    const req = getMockReq({ phoneNumber: TEST_PHONE, password: TEST_PASSWORD });
    const res = getMockRes();
    await teacherAuth.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
    expect(res.body.message.toLowerCase()).toContain("name");
  });

  test("register fails with empty string name", async () => {
    const req = getMockReq({ phoneNumber: TEST_PHONE, password: TEST_PASSWORD, name: "" });
    const res = getMockRes();
    await teacherAuth.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
  });

  test("register fails with whitespace-only name", async () => {
    const req = getMockReq({ phoneNumber: TEST_PHONE, password: TEST_PASSWORD, name: "   \t  " });
    const res = getMockRes();
    await teacherAuth.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
  });

  test("register fails with invalid phone number format", async () => {
    const req = getMockReq({
      phoneNumber: "not-a-phone",
      password: TEST_PASSWORD,
      name: TEST_TEACHER_NAME,
    });
    const res = getMockRes();
    await teacherAuth.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
    expect(res.body.message.toLowerCase()).toContain("phone");
  });

  test("register fails with weak password", async () => {
    const req = getMockReq({
      phoneNumber: TEST_PHONE,
      password: "weak",
      name: TEST_TEACHER_NAME,
    });
    const res = getMockRes();
    await teacherAuth.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
    expect(res.body.message.toLowerCase()).toContain("password");
  });

  test("register trims name before storage", async () => {
    const nameWithSpaces = "  Trimmed Teacher  ";
    const req = getMockReq({
      phoneNumber: TEST_PHONE,
      password: TEST_PASSWORD,
      name: nameWithSpaces,
    });

    const teacherRepo = require("../../src/repositories/teacher.repository");
    let capturedInsertData;
    jest.spyOn(teacherRepo, "getTeacherBySchoolIdAndPhoneNumber").mockResolvedValue(null);
    jest.spyOn(teacherRepo, "insertTeacher").mockImplementation((data) => {
      capturedInsertData = data;
      return Promise.resolve(data);
    });

    const res = getMockRes();
    await teacherAuth.register(req, res);
    expect(capturedInsertData.name).toBe("Trimmed Teacher");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
