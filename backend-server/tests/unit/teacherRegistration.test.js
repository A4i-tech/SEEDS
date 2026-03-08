process.env.AUTH_TYPE = "native";
process.env.SECRET_KEY = "test-secret-key-for-testing-purposes-123";

const teacherController = require("../../src/controllers/teacher.controller");

const STATUS_BAD_REQUEST = 400;

const TEST_PHONE = "1234567890";
const TEST_PASSWORD = "TestPassword123!";
const TEST_TEACHER_NAME = "Test Teacher";
const TEST_SCHOOL_ID = "school123";
const TEST_TENANT_ID = "tenant123";

function getMockReq(body) {
  return { body, schoolId: TEST_SCHOOL_ID, tenantId: TEST_TENANT_ID };
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
    await teacherController.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
    expect(res.body.message.toLowerCase()).toContain("name");
  });

  test("register fails with empty string name", async () => {
    const req = getMockReq({ phoneNumber: TEST_PHONE, password: TEST_PASSWORD, name: "" });
    const res = getMockRes();
    await teacherController.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
  });

  test("register fails with whitespace-only name", async () => {
    const req = getMockReq({ phoneNumber: TEST_PHONE, password: TEST_PASSWORD, name: "   \t  " });
    const res = getMockRes();
    await teacherController.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
  });

  test("register fails with invalid phone number format", async () => {
    const req = getMockReq({
      phoneNumber: "not-a-phone",
      password: TEST_PASSWORD,
      name: TEST_TEACHER_NAME,
    });
    const res = getMockRes();
    await teacherController.register(req, res);
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
    await teacherController.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
    expect(res.body.message.toLowerCase()).toContain("password");
  });

  test("register trims name before storage", async () => {
    const nameWithSpaces = "  Trimmed Teacher  ";
    const req = getMockReq({
      phoneNumber: TEST_PHONE,
      password: TEST_PASSWORD,
      name: nameWithSpaces,
      role: "teacher",
    });

    const teacherService = require("../../src/services/teacher.service");

    let capturedName;
    jest.spyOn(teacherService, "registerTeacher").mockImplementation((_phone, _pass, _schoolId, name) => {
      capturedName = name;
      return Promise.resolve({});
    });

    const res = getMockRes();
    await teacherController.register(req, res);
    expect(capturedName).toBe("Trimmed Teacher");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
