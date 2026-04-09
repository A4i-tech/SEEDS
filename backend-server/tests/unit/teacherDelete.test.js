process.env.AUTH_TYPE = "native";
process.env.SECRET_KEY = "test-secret-key-for-testing-purposes-123";

const teacherController = require("../../src/controllers/teacher.controller");
const teacherService = require("../../src/services/teacher.service");

const STATUS_OK = 200;
const STATUS_NOT_FOUND = 404;

function getMockReq(params = {}, schoolId = "school123") {
  return { params, schoolId };
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

describe("Teacher delete API handler (unit)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns 200 when teacher is deleted", async () => {
    jest.spyOn(teacherService, "deleteTeacher").mockResolvedValue({ _id: "teacher1" });

    const req = getMockReq({ teacherId: "teacher1" });
    const res = getMockRes();

    await teacherController.delete(req, res);

    expect(teacherService.deleteTeacher).toHaveBeenCalledWith("teacher1", "school123");
    expect(res.statusCode).toBe(STATUS_OK);
    expect(res.body).toEqual({ message: "Teacher deleted successfully" });
  });

  test("returns 404 when teacher is not found", async () => {
    const notFoundError = new Error("Teacher not found");
    notFoundError.status = STATUS_NOT_FOUND;
    jest.spyOn(teacherService, "deleteTeacher").mockRejectedValue(notFoundError);

    const req = getMockReq({ teacherId: "missing" });
    const res = getMockRes();

    await teacherController.delete(req, res);

    expect(res.statusCode).toBe(STATUS_NOT_FOUND);
    expect(res.body).toEqual({ message: "Teacher not found" });
  });
});
