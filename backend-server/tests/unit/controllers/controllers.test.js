const mongoose = require("mongoose");

function getMockReq({ body = {}, params = {}, user = null, headers = {} } = {}) {
  return { body, params, headers, user, userId: user?.id, role: user?.role, schoolId: user?.schoolId, tenantId: user?.tenantId };
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
  res.send = function (data) {
    this.body = data;
    return this;
  };
  return res;
}

// --- School Controller ---

jest.mock("../../../src/services/school.service");
const schoolService = require("../../../src/services/school.service");
const schoolController = require("../../../src/controllers/school.controller");

describe("School Controller - Unit Tests", () => {
  afterEach(() => jest.restoreAllMocks());

  test("createSchool returns 400 when name is missing", async () => {
    const req = getMockReq({ body: { email: "s@example.com", password: "Valid1!" }, user: { id: "t1" } });
    const res = getMockRes();

    await schoolController.createSchool(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  test("createSchool returns 400 for invalid email", async () => {
    const req = getMockReq({ body: { name: "School", email: "not-an-email", password: "ValidPass1!" }, user: { id: "t1" } });
    const res = getMockRes();

    await schoolController.createSchool(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  test("createSchool returns 400 for weak password", async () => {
    const req = getMockReq({ body: { name: "School", email: "s@example.com", password: "weak" }, user: { id: "t1" } });
    const res = getMockRes();

    await schoolController.createSchool(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });

  test("createSchool returns 201 with valid input", async () => {
    const school = { _id: "s1", name: "School", email: "s@example.com" };
    schoolService.createSchool.mockResolvedValue(school);

    const req = getMockReq({ body: { name: "School", email: "s@example.com", password: "ValidPass1!" }, user: { id: "t1" } });
    const res = getMockRes();

    await schoolController.createSchool(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(school);
    expect(schoolService.createSchool).toHaveBeenCalledWith("School", "s@example.com", "t1", "ValidPass1!");
  });

  test("getSchools returns 200 with list of schools", async () => {
    const schools = [{ name: "A" }, { name: "B" }];
    schoolService.getSchools.mockResolvedValue(schools);

    const req = getMockReq({ user: { id: "t1" } });
    const res = getMockRes();

    await schoolController.getSchools(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(schools);
  });

  test("getSchoolAnalytics returns 400 when dates are missing", async () => {
    const req = getMockReq({ body: {}, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await schoolController.getSchoolAnalytics(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  test("getSchoolAnalytics returns 400 for invalid date format", async () => {
    const req = getMockReq({ body: { startDate: "not-a-date", endDate: "also-bad" }, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await schoolController.getSchoolAnalytics(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/invalid date/i);
  });

  test("getSchoolAnalytics returns 200 with valid dates", async () => {
    schoolService.getSchoolAnalytics.mockResolvedValue([]);

    const req = getMockReq({ body: { startDate: "2025-01-01T00:00:00Z", endDate: "2025-12-31T23:59:59Z" }, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await schoolController.getSchoolAnalytics(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(0);
  });
});

// --- Student Controller ---

jest.mock("../../../src/services/student.service");
const studentService = require("../../../src/services/student.service");
const studentController = require("../../../src/controllers/student.controller");

describe("Student Controller - Unit Tests", () => {
  afterEach(() => jest.restoreAllMocks());

  test("createStudent returns 400 when name is missing", async () => {
    const req = getMockReq({ body: { phoneNumber: "1234567890" }, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await studentController.createStudent(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  test("createStudent returns 400 when phoneNumber is missing", async () => {
    const req = getMockReq({ body: { name: "Student" }, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await studentController.createStudent(req, res);

    expect(res.statusCode).toBe(400);
  });

  test("createStudent returns 201 with valid input", async () => {
    const student = { _id: "st1", name: "Student", phoneNumber: "1234567890" };
    studentService.createStudent.mockResolvedValue(student);

    const req = getMockReq({ body: { name: "Student", phoneNumber: "1234567890" }, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await studentController.createStudent(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(student);
    expect(studentService.createStudent).toHaveBeenCalledWith("Student", "1234567890", "s1");
  });

  test("createStudent returns 409 on duplicate phone number", async () => {
    studentService.createStudent.mockRejectedValue({ code: 11000 });

    const req = getMockReq({ body: { name: "Student", phoneNumber: "1234567890" }, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await studentController.createStudent(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/phone/i);
  });

  test("getStudents returns 200 with list", async () => {
    studentService.getStudentsBySchoolId.mockResolvedValue([{ name: "A" }]);

    const req = getMockReq({ user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await studentController.getStudents(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test("updateStudent returns 400 when no fields provided", async () => {
    const req = getMockReq({ body: {}, params: { studentId: "st1" }, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await studentController.updateStudent(req, res);

    expect(res.statusCode).toBe(400);
  });

  test("deleteStudent returns 200 on success", async () => {
    studentService.deleteStudent.mockResolvedValue();

    const req = getMockReq({ params: { studentId: "st1" }, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await studentController.deleteStudent(req, res);

    expect(res.statusCode).toBe(200);
  });

  test("deleteStudent returns 404 when student not found", async () => {
    studentService.deleteStudent.mockRejectedValue({ status: 404, message: "Student not found" });

    const req = getMockReq({ params: { studentId: "st1" }, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await studentController.deleteStudent(req, res);

    expect(res.statusCode).toBe(404);
  });
});

// --- Teacher Controller ---

jest.mock("../../../src/services/teacher.service");
const teacherService = require("../../../src/services/teacher.service");
const teacherController = require("../../../src/controllers/teacher.controller");

describe("Teacher Controller - Unit Tests", () => {
  afterEach(() => jest.restoreAllMocks());

  test("register returns 400 when required fields are missing", async () => {
    const req = getMockReq({ body: { phoneNumber: "1234567890" }, user: { schoolId: "s1", tenantId: "t1" } });
    req.schoolId = "s1";
    req.tenantId = "t1";
    const res = getMockRes();

    await teacherController.register(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  test("register returns 400 for invalid phone number", async () => {
    const req = getMockReq({
      body: { phoneNumber: "abc", password: "ValidPass1!", name: "Teacher", role: "teacher" },
      user: { schoolId: "s1", tenantId: "t1" },
    });
    req.schoolId = "s1";
    req.tenantId = "t1";
    const res = getMockRes();

    await teacherController.register(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/phone/i);
  });

  test("register returns 400 for weak password", async () => {
    const req = getMockReq({
      body: { phoneNumber: "1234567890", password: "weak", name: "Teacher", role: "teacher" },
      user: { schoolId: "s1", tenantId: "t1" },
    });
    req.schoolId = "s1";
    req.tenantId = "t1";
    const res = getMockRes();

    await teacherController.register(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });

  test("register returns 201 with valid input", async () => {
    teacherService.registerTeacher.mockResolvedValue();

    const req = getMockReq({
      body: { phoneNumber: "1234567890", password: "ValidPass1!", name: "Teacher", role: "teacher" },
      user: { schoolId: "s1", tenantId: "t1" },
    });
    req.schoolId = "s1";
    req.tenantId = "t1";
    const res = getMockRes();

    await teacherController.register(req, res);

    expect(res.statusCode).toBe(201);
    expect(teacherService.registerTeacher).toHaveBeenCalled();
  });

  test("transferTeacher returns 400 when teacherId is missing", async () => {
    const req = getMockReq({ body: { targetSchoolId: "s2" }, user: { schoolId: "s1", tenantId: "t1" } });
    req.schoolId = "s1";
    req.tenantId = "t1";
    const res = getMockRes();

    await teacherController.transferTeacher(req, res);

    expect(res.statusCode).toBe(400);
  });

  test("update returns 400 when no fields provided", async () => {
    const req = getMockReq({ body: {}, params: { teacherId: "t1" }, user: { schoolId: "s1" } });
    req.schoolId = "s1";
    const res = getMockRes();

    await teacherController.update(req, res);

    expect(res.statusCode).toBe(400);
  });
});

// --- Tenant Controller ---

jest.mock("../../../src/services/tenant.service");
const tenantService = require("../../../src/services/tenant.service");
const tenantController = require("../../../src/controllers/tenant.controller");

describe("Tenant Controller - Unit Tests", () => {
  afterEach(() => jest.restoreAllMocks());

  test("getMe returns 200 with tenant data", async () => {
    tenantService.getTenantById.mockResolvedValue({ email: "t@example.com", tenantName: "T1" });

    const req = getMockReq({ user: { id: "t1" } });
    req.userId = "t1";
    const res = getMockRes();

    await tenantController.getMe(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.email).toBe("t@example.com");
    expect(res.body.tenantName).toBe("T1");
  });

  test("getMe returns 404 when tenant not found", async () => {
    tenantService.getTenantById.mockResolvedValue(null);

    const req = getMockReq({ user: { id: "t1" } });
    req.userId = "t1";
    const res = getMockRes();

    await tenantController.getMe(req, res);

    expect(res.statusCode).toBe(404);
  });

  test("getAnalytics returns 400 when dates are missing", async () => {
    const req = getMockReq({ body: {}, user: { id: "t1" } });
    req.userId = "t1";
    const res = getMockRes();

    await tenantController.getAnalytics(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  test("getAnalytics returns 200 with valid dates", async () => {
    tenantService.getTenantAnalytics.mockResolvedValue([]);

    const req = getMockReq({ body: { startDate: "2025-01-01T00:00:00Z", endDate: "2025-12-31T23:59:59Z" }, user: { id: "t1" } });
    req.userId = "t1";
    const res = getMockRes();

    await tenantController.getAnalytics(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(0);
  });
});
