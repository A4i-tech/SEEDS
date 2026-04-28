process.env.AUTH_TYPE = "native";
process.env.SECRET_KEY = "test-secret-key-for-testing-purposes-123";

const teacherController = require("../../src/controllers/teacher.controller");
const teacherService = require("../../src/services/teacher.service");
const schoolService = require("../../src/services/school.service");

const STATUS_OK = 200;
const STATUS_NOT_FOUND = 404;

function getMockReq(overrides = {}) {
  return {
    userId: "teacher123",
    tenantId: "tenant123",
    ...overrides,
  };
}

function getMockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
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

describe("Teacher getMe API handler (unit)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns teacher profile with school name when school exists", async () => {
    jest.spyOn(teacherService, "getTeacherById").mockResolvedValue({
      name: "Creator User",
      phoneNumber: "9876543210",
      role: "content_creator",
      schoolId: "school123",
    });
    jest.spyOn(schoolService, "getSchoolById").mockResolvedValue({ name: "School One" });

    const req = getMockReq();
    const res = getMockRes();

    await teacherController.getMe(req, res);

    expect(teacherService.getTeacherById).toHaveBeenCalledWith("teacher123");
    expect(schoolService.getSchoolById).toHaveBeenCalledWith("school123", "tenant123");
    expect(res.statusCode).toBe(STATUS_OK);
    expect(res.body).toEqual({ schoolName: "School One" });
  });

  test("returns empty schoolName when school lookup is not found", async () => {
    jest.spyOn(teacherService, "getTeacherById").mockResolvedValue({
      name: "Teacher User",
      phoneNumber: "1234567890",
      role: "teacher",
      schoolId: "missing-school",
    });
    const notFoundError = new Error("School not found");
    notFoundError.status = STATUS_NOT_FOUND;
    jest.spyOn(schoolService, "getSchoolById").mockRejectedValue(notFoundError);

    const req = getMockReq();
    const res = getMockRes();

    await teacherController.getMe(req, res);

    expect(res.statusCode).toBe(STATUS_OK);
    expect(res.body).toEqual({ schoolName: "" });
  });
});
