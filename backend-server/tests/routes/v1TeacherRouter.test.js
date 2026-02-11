process.env.SECRET_KEY = "test-secret-key-v1-teacher";
process.env.AUTH_TYPE = "native";

const request = require("supertest");
const app = require("../../src/index");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Teacher = require("../../src/models/Teacher");
const Student = require("../../src/models/Student");
const { STATUS } = require("../../src/config/constants");

const {
  OK: STATUS_OK,
  BAD_REQUEST: STATUS_BAD_REQUEST,
  UNAUTHORIZED: STATUS_UNAUTHORIZED,
  FORBIDDEN: STATUS_FORBIDDEN,
  NOT_FOUND: STATUS_NOT_FOUND,
  CONFLICT: STATUS_CONFLICT,
  INTERNAL_ERROR: STATUS_INTERNAL_ERROR,
} = STATUS;

const TENANT_ID = "tenant-v1-test";
const TEACHER_PHONE = "919876543210";
const TEACHER_PASSWORD = "TeacherPass1!";

let mongoServer;
let authToken;

function getAuthToken() {
  return jwt.sign(
    { email: "teacher-test@example.com", id: "user-123" },
    process.env.SECRET_KEY,
    { expiresIn: "1h" }
  );
}

describe("v1TeacherRouter", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    authToken = getAuthToken();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Teacher.deleteMany({});
    await Student.deleteMany({});
  });

  describe("POST /v1/teacher/add-students", () => {
    test("returns 401 without token", async () => {
      const res = await request(app)
        .post("/v1/teacher/add-students")
        .send({ phoneNumber: TEACHER_PHONE, students: [{ name: "A", phoneNumber: "911111111111" }] });
      expect(res.status).toBe(STATUS_UNAUTHORIZED);
    });

    test("returns 400 when students is not an array", async () => {
      await Teacher.create({ tenantId: TENANT_ID, phoneNumber: TEACHER_PHONE, password: TEACHER_PASSWORD, studentId: [] });
      const res = await request(app)
        .post("/v1/teacher/add-students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ phoneNumber: TEACHER_PHONE, students: "not-array" });
      expect(res.status).toBe(STATUS_BAD_REQUEST);
    });

    test("returns 400 when students array is empty", async () => {
      await Teacher.create({ tenantId: TENANT_ID, phoneNumber: TEACHER_PHONE, password: TEACHER_PASSWORD, studentId: [] });
      const res = await request(app)
        .post("/v1/teacher/add-students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ phoneNumber: TEACHER_PHONE, students: [] });
      expect(res.status).toBe(STATUS_BAD_REQUEST);
    });

    test("returns 404 when teacher not found", async () => {
      const res = await request(app)
        .post("/v1/teacher/add-students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ phoneNumber: "919999999999", students: [{ name: "A", phoneNumber: "912222222222" }] });
      expect(res.status).toBe(STATUS_NOT_FOUND);
    });

    test("returns 200 and creates new students", async () => {
      await Teacher.create({ tenantId: TENANT_ID, phoneNumber: TEACHER_PHONE, password: TEACHER_PASSWORD, studentId: [] });
      const res = await request(app)
        .post("/v1/teacher/add-students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          phoneNumber: TEACHER_PHONE,
          students: [
            { name: "Alice", phoneNumber: "911111111111" },
            { name: "Bob", phoneNumber: "912222222222" },
          ],
        });
      expect(res.status).toBe(STATUS_OK);
      expect(res.body).toHaveProperty("students");
      expect(Array.isArray(res.body.students)).toBe(true);
      expect(res.body.students).toHaveLength(2);
      expect(res.body.students.map((s) => s.name).sort()).toEqual(["Alice", "Bob"]);
      const teacher = await Teacher.findOne({ phoneNumber: TEACHER_PHONE });
      expect(Array.isArray(teacher.studentId)).toBe(true);
      expect(teacher.studentId).toHaveLength(2);
    });

    test("returns 200 with duplicates when same phone different name", async () => {
      await Teacher.create({ tenantId: TENANT_ID, phoneNumber: TEACHER_PHONE, password: TEACHER_PASSWORD, studentId: [] });
      await Student.create({ name: "Existing", phoneNumber: "913333333333" });
      const res = await request(app)
        .post("/v1/teacher/add-students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          phoneNumber: TEACHER_PHONE,
          students: [{ name: "NewName", phoneNumber: "913333333333" }],
        });
      expect(res.status).toBe(STATUS_OK);
      expect(res.body).toHaveProperty("duplicates");
      expect(res.body.duplicates).toHaveLength(1);
      expect(res.body.duplicates[0]).toMatchObject({
        phoneNumber: "913333333333",
        existingName: "Existing",
        submittedName: "NewName",
      });
      expect(res.body.students).toHaveLength(0);
    });

    test("returns 200 with alreadyLinked when student already on teacher", async () => {
      const existingStudent = await Student.create({ name: "Already", phoneNumber: "914444444444" });
      await Teacher.create({
        tenantId: TENANT_ID,
        phoneNumber: TEACHER_PHONE,
        password: TEACHER_PASSWORD,
        studentId: [String(existingStudent._id)],
      });
      const res = await request(app)
        .post("/v1/teacher/add-students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          phoneNumber: TEACHER_PHONE,
          students: [{ name: "Already", phoneNumber: "914444444444" }],
        });
      expect(res.status).toBe(STATUS_OK);
      expect(res.body).toHaveProperty("alreadyLinked");
      expect(res.body.alreadyLinked).toHaveLength(1);
      expect(res.body.alreadyLinked[0]).toMatchObject({ name: "Already", phoneNumber: "914444444444" });
      expect(res.body.students).toHaveLength(0);
    });

    test("filters out entries without name or phoneNumber", async () => {
      await Teacher.create({ tenantId: TENANT_ID, phoneNumber: TEACHER_PHONE, password: TEACHER_PASSWORD, studentId: [] });
      const res = await request(app)
        .post("/v1/teacher/add-students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          phoneNumber: TEACHER_PHONE,
          students: [
            { name: "", phoneNumber: "915555555555" },
            { name: "Valid", phoneNumber: "916666666666" },
            { name: "NoPhone", phoneNumber: "" },
          ],
        });
      expect(res.status).toBe(STATUS_OK);
      expect(res.body.students).toHaveLength(1);
      expect(res.body.students[0]).toMatchObject({ name: "Valid", phoneNumber: "916666666666" });
    });
  });

  describe("PATCH /v1/teacher/students", () => {
    test("returns 401 without token", async () => {
      const res = await request(app)
        .patch("/v1/teacher/students")
        .send({
          phoneNumber: TEACHER_PHONE,
          currentPhoneNumber: "911111111111",
          name: "New",
          studentPhoneNumber: "911111111111",
        });
      expect(res.status).toBe(STATUS_UNAUTHORIZED);
    });

    test("returns 400 when required body fields missing", async () => {
      const res = await request(app)
        .patch("/v1/teacher/students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ phoneNumber: TEACHER_PHONE });
      expect(res.status).toBe(STATUS_BAD_REQUEST);
    });

    test("returns 404 when teacher not found", async () => {
      await Student.create({ name: "S", phoneNumber: "917777777777" });
      const res = await request(app)
        .patch("/v1/teacher/students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          phoneNumber: "919999999999",
          currentPhoneNumber: "917777777777",
          name: "New",
          studentPhoneNumber: "917777777777",
        });
      expect(res.status).toBe(STATUS_NOT_FOUND);
    });

    test("returns 404 when student not found", async () => {
      await Teacher.create({ tenantId: TENANT_ID, phoneNumber: TEACHER_PHONE, password: TEACHER_PASSWORD, studentId: [] });
      const res = await request(app)
        .patch("/v1/teacher/students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          phoneNumber: TEACHER_PHONE,
          currentPhoneNumber: "917777777777",
          name: "New",
          studentPhoneNumber: "917777777777",
        });
      expect(res.status).toBe(STATUS_NOT_FOUND);
    });

    test("returns 403 when student does not belong to teacher", async () => {
      await Teacher.create({ tenantId: TENANT_ID, phoneNumber: TEACHER_PHONE, password: TEACHER_PASSWORD, studentId: [] });
      await Student.create({ name: "Unlinked", phoneNumber: "917777777777" });
      const res = await request(app)
        .patch("/v1/teacher/students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          phoneNumber: TEACHER_PHONE,
          currentPhoneNumber: "917777777777",
          name: "New",
          studentPhoneNumber: "917777777777",
        });
      expect(res.status).toBe(STATUS_FORBIDDEN);
    });

    test("returns 200 and updates student name and phone", async () => {
      await Teacher.create({ tenantId: TENANT_ID, phoneNumber: TEACHER_PHONE, password: TEACHER_PASSWORD, studentId: [] });
      const student = await Student.create({ name: "Old", phoneNumber: "918888888881" });
      await Teacher.updateOne({ phoneNumber: TEACHER_PHONE }, { $addToSet: { studentId: String(student._id) } });
      const res = await request(app)
        .patch("/v1/teacher/students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          phoneNumber: TEACHER_PHONE,
          currentPhoneNumber: "918888888881",
          name: "Updated",
          studentPhoneNumber: "918888888882",
        });
      expect(res.status).toBe(STATUS_OK);
      expect(res.body).toMatchObject({ name: "Updated", phoneNumber: "918888888882" });
      const updated = await Student.findById(student._id);
      expect(updated.name).toBe("Updated");
      expect(updated.phoneNumber).toBe("918888888882");
    });

    test("returns 409 when new phone already exists for another student", async () => {
      await Teacher.create({ tenantId: TENANT_ID, phoneNumber: TEACHER_PHONE, password: TEACHER_PASSWORD, studentId: [] });
      const student1 = await Student.create({ name: "One", phoneNumber: "918888888883" });
      await Student.create({ name: "Other", phoneNumber: "918888888884" });
      await Teacher.updateOne({ phoneNumber: TEACHER_PHONE }, { $addToSet: { studentId: String(student1._id) } });
      const res = await request(app)
        .patch("/v1/teacher/students")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          phoneNumber: TEACHER_PHONE,
          currentPhoneNumber: "918888888883",
          name: "One",
          studentPhoneNumber: "918888888884",
        });
      expect(res.status).toBe(STATUS_CONFLICT);
      expect(res.body.message).toMatch(/phone number already exists/i);
    });
  });
});
