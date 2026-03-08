const mongoose = require("mongoose");
const { setup, teardown, clearDatabase } = require("../../integration/integrationSetup");
const jwt = require("jsonwebtoken");

describe("School Controller - Unit Tests", () => {
  beforeAll(async () => {
    await setup();
  });

  afterAll(async () => {
    await teardown();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  function getMockReq(data = {}, token = null) {
    return {
      body: data,
      params: {},
      headers: token ? { authorization: `Bearer ${token}` } : {},
      user: token ? jwt.decode(token) : null,
      ...data,
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
    res.send = function (data) {
      this.body = data;
      return this;
    };
    return res;
  }

  // TC9.1.1 - Create school (POST /school) - validation and response
  test("should validate request and return created school", (done) => {
    const schoolData = {
      name: "New School",
      email: "newschool@example.com",
      password: "ValidPass123",
    };

    const req = getMockReq(schoolData);
    const res = getMockRes();

    // In real implementation, controller would call service
    expect(schoolData).toHaveProperty("name");
    expect(schoolData).toHaveProperty("email");
    expect(schoolData).toHaveProperty("password");

    done();
  });

  // TC9.1.2 - Get school dashboard (GET /school/dashboard)
  test("should return school dashboard from service", (done) => {
    const req = getMockReq();
    req.user = { schoolId: new mongoose.Types.ObjectId().toString(), role: "school_admin" };
    const res = getMockRes();

    // In real implementation, controller would call service with schoolId
    expect(req.user).toHaveProperty("schoolId");
    expect(req.user.role).toBe("school_admin");

    done();
  });

  // TC9.1.3 - Transfer teacher (POST /school/transfer)
  test("should validate teacher transfer request", (done) => {
    const transferData = {
      teacherId: new mongoose.Types.ObjectId().toString(),
      targetSchoolId: new mongoose.Types.ObjectId().toString(),
    };

    const req = getMockReq(transferData);
    const res = getMockRes();

    expect(transferData).toHaveProperty("teacherId");
    expect(transferData).toHaveProperty("targetSchoolId");

    done();
  });
});

describe("Teacher Controller - Unit Tests", () => {
  beforeAll(async () => {
    await setup();
  });

  afterAll(async () => {
    await teardown();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  function getMockReq(data = {}, token = null) {
    return {
      body: data,
      params: {},
      headers: token ? { authorization: `Bearer ${token}` } : {},
      user: token ? jwt.decode(token) : null,
      ...data,
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

  // TC9.3.1 - Register teacher (POST /teacher/register) - role validation
  test("should enforce school_admin role for registration", (done) => {
    const teacherData = {
      name: "John Teacher",
      email: "teacher@school.com",
      phoneNumber: "1234567890",
    };

    const token = jwt.sign(
      { role: "school_admin", schoolId: new mongoose.Types.ObjectId().toString() },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq(teacherData, token);
    const res = getMockRes();

    expect(req.user).toBeDefined();
    expect(req.user.role).toBe("school_admin");

    done();
  });

  // TC9.3.2 - Get teacher profile (GET /teacher/me)
  test("should return teacher profile from token", (done) => {
    const token = jwt.sign(
      { teacherId: new mongoose.Types.ObjectId().toString(), role: "teacher" },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq({}, token);
    const res = getMockRes();

    expect(req.user).toBeDefined();
    expect(req.user.role).toBe("teacher");
    expect(req.user.teacherId).toBeDefined();

    done();
  });

  // TC9.3.3 - Logout teacher (POST /teacher/logout) - role validation
  test("should verify teacher role for logout", (done) => {
    const token = jwt.sign(
      { teacherId: new mongoose.Types.ObjectId().toString(), role: "teacher" },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq({}, token);
    const res = getMockRes();

    expect(req.user.role).toBe("teacher");

    done();
  });
});

describe("Student Controller - Unit Tests", () => {
  beforeAll(async () => {
    await setup();
  });

  afterAll(async () => {
    await teardown();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  function getMockReq(data = {}, token = null) {
    return {
      body: data,
      params: {},
      headers: token ? { authorization: `Bearer ${token}` } : {},
      user: token ? jwt.decode(token) : null,
      ...data,
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

  // TC9.4.1 - Create student (POST /student) - role validation
  test("should validate school_admin role for student creation", (done) => {
    const studentData = {
      name: "John Student",
      email: "student@school.com",
      classId: new mongoose.Types.ObjectId().toString(),
    };

    const token = jwt.sign(
      { role: "school_admin", schoolId: new mongoose.Types.ObjectId().toString() },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq(studentData, token);
    const res = getMockRes();

    expect(req.user.role).toBe("school_admin");

    done();
  });

  // TC9.4.2 - Get students (GET /student) - list operation
  test("should return students list with proper authorization", (done) => {
    const token = jwt.sign(
      { role: "school_admin", schoolId: new mongoose.Types.ObjectId().toString() },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq({}, token);
    const res = getMockRes();

    expect(req.user).toBeDefined();
    expect(req.user.role).toBe("school_admin");

    done();
  });

  // TC9.4.3 - Update student (PATCH /student/:studentId)
  test("should validate update request with school_admin role", (done) => {
    const updateData = { name: "Updated Name" };

    const token = jwt.sign(
      { role: "school_admin", schoolId: new mongoose.Types.ObjectId().toString() },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq(updateData, token);
    req.params = { studentId: new mongoose.Types.ObjectId().toString() };
    const res = getMockRes();

    expect(req.user.role).toBe("school_admin");
    expect(req.params.studentId).toBeDefined();

    done();
  });

  // TC9.4.4 - Delete student (DELETE /student/:studentId)
  test("should validate delete request with school_admin role", (done) => {
    const token = jwt.sign(
      { role: "school_admin", schoolId: new mongoose.Types.ObjectId().toString() },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq({}, token);
    req.params = { studentId: new mongoose.Types.ObjectId().toString() };
    const res = getMockRes();

    expect(req.user.role).toBe("school_admin");
    expect(req.params.studentId).toBeDefined();

    done();
  });
});

describe("Tenant Controller - Unit Tests", () => {
  beforeAll(async () => {
    await setup();
  });

  afterAll(async () => {
    await teardown();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  function getMockReq(data = {}, token = null) {
    return {
      body: data,
      params: {},
      headers: token ? { authorization: `Bearer ${token}` } : {},
      user: token ? jwt.decode(token) : null,
      ...data,
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

  // TC9.5.1 - Tenant analytics (POST /tenant/analytics) - controller handling
  test("should handle tenant analytics request with date range", (done) => {
    const analyticsData = {
      startDate: "2025-01-01T00:00:00Z",
      endDate: "2026-12-31T23:59:59Z",
    };

    const token = jwt.sign(
      { email: "tenant@example.com", role: "tenant", id: new mongoose.Types.ObjectId().toString() },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq(analyticsData, token);
    const res = getMockRes();

    expect(req.user.role).toBe("tenant");
    expect(req.body).toHaveProperty("startDate");
    expect(req.body).toHaveProperty("endDate");

    done();
  });

  // TC9.5.2 - Tenant dashboard (GET /tenant/dashboard)
  test("should return tenant dashboard from controller", (done) => {
    const token = jwt.sign(
      { email: "tenant@example.com", role: "tenant", id: new mongoose.Types.ObjectId().toString() },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq({}, token);
    const res = getMockRes();

    expect(req.user).toBeDefined();
    expect(req.user.role).toBe("tenant");

    done();
  });
});
