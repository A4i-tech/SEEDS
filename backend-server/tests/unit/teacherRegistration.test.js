process.env.AUTH_TYPE = "native";
process.env.SECRET_KEY = "test-secret-key-for-testing-purposes-123";

const teacherController = require("../../src/controllers/teacher.controller");

const STATUS_BAD_REQUEST = 400;

const TEST_PHONE = "1234567890";
const TEST_PASSWORD = "TestPassword123!";
const TEST_TEACHER_NAME = "Test Teacher";
const TEST_SCHOOL_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TEST_TENANT_ID = "tenant123";
const TEST_ROLE = "teacher";

function getMockReq(body) {
  return {
    body,
    schoolId: TEST_SCHOOL_ID,
    tenantId: TEST_TENANT_ID,
    user: { id: TEST_SCHOOL_ID, role: "school_admin" },
    userId: TEST_SCHOOL_ID,
    role: "school_admin",
  };
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
    const req = getMockReq({ phoneNumber: TEST_PHONE, password: TEST_PASSWORD, role: TEST_ROLE });
    const res = getMockRes();
    await teacherController.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
  });

  test("register fails with empty string name", async () => {
    const req = getMockReq({
      phoneNumber: TEST_PHONE,
      password: TEST_PASSWORD,
      name: "",
      role: TEST_ROLE,
    });
    const res = getMockRes();
    await teacherController.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
  });

  test("register fails with whitespace-only name", async () => {
    const req = getMockReq({
      phoneNumber: TEST_PHONE,
      password: TEST_PASSWORD,
      name: "   \t  ",
      role: TEST_ROLE,
    });
    const res = getMockRes();
    await teacherController.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
  });

  test("register fails with invalid phone number format", async () => {
    const req = getMockReq({
      phoneNumber: "not-a-phone",
      password: TEST_PASSWORD,
      name: TEST_TEACHER_NAME,
      role: TEST_ROLE,
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
      role: TEST_ROLE,
    });
    const res = getMockRes();
    await teacherController.register(req, res);
    expect(res.statusCode).toBe(STATUS_BAD_REQUEST);
    expect(res.body.message.toLowerCase()).toContain("password");
  });

  test("register trims name before validation", async () => {
    const req = getMockReq({
      phoneNumber: TEST_PHONE,
      password: TEST_PASSWORD,
      name: "  Trimmed Teacher  ",
      role: TEST_ROLE,
    });

    const teacherService = require("../../src/services/teacher.service");
    jest.spyOn(teacherService, "registerTeacher").mockResolvedValue({});

    const res = getMockRes();
    await teacherController.register(req, res);

    expect(teacherService.registerTeacher).toHaveBeenCalledWith(
      TEST_PHONE,
      TEST_PASSWORD,
      TEST_SCHOOL_ID,
      "Trimmed Teacher",
      TEST_ROLE,
      TEST_TENANT_ID
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
