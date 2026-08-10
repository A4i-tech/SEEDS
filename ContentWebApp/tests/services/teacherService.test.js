import { teacherService } from "../../src/services/teacherService";
import { apiFetch } from "../../src/services/api";

jest.mock("../../src/services/api");
jest.mock("../../src/Constants", () => ({ SEEDS_URL: "http://test-api" }));

describe("teacherService", () => {
  const mockHeaders = { Authorization: "Bearer t" };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createStudent", () => {
    test("calls apiFetch with POST to /student and correct body", async () => {
      const mockResponse = { id: "s1", name: "A", phone_number: "911111111111" };
      apiFetch.mockResolvedValue(mockResponse);

      const result = await teacherService.createStudent("A", "911111111111", {
        Authorization: "Bearer x",
      });

      expect(apiFetch).toHaveBeenCalledWith("http://test-api/student", {
        method: "POST",
        headers: { Authorization: "Bearer x" },
        body: JSON.stringify({
          name: "A",
          phone_number: "911111111111",
        }),
      });
      expect(result.id).toBe("s1");
      expect(result.name).toBe("A");
      expect(result.phone_number).toBe("911111111111");
    });

    test("returns created student on success", async () => {
      const mockResponse = { id: "s2", name: "New", phone_number: "912222222222" };
      apiFetch.mockResolvedValue(mockResponse);

      const result = await teacherService.createStudent("New", "912222222222", {});

      expect(result.id).toBe("s2");
      expect(result.phone_number).toBe("912222222222");
    });
  });

  describe("updateStudentById", () => {
    test("calls apiFetch with PATCH and correct body", async () => {
      const mockResponse = { id: "918888888881", name: "Updated", phone_number: "918888888882" };
      apiFetch.mockResolvedValue(mockResponse);

      const result = await teacherService.updateStudentById(
        "918888888881",
        "Updated",
        "918888888882",
        {}
      );

      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(apiFetch).toHaveBeenCalledWith("http://test-api/student/918888888881", {
        method: "PATCH",
        headers: {},
        body: JSON.stringify({
          name: "Updated",
          phone_number: "918888888882",
        }),
      });
      expect(result.name).toBe("Updated");
      expect(result.phone_number).toBe("918888888882");
    });

    test("propagates error with status 409 when new phone already exists", async () => {
      const conflictError = Object.assign(new Error("Conflict"), { status: 409 });
      apiFetch.mockRejectedValue(conflictError);

      await expect(
        teacherService.updateStudentById("916666666666", "Name", "917777777777", {})
      ).rejects.toMatchObject({ status: 409, message: "Conflict" });
    });
  });

  describe("updateTeacher", () => {
    test("trims name and phone in PATCH body", async () => {
      const mockResponse = { id: "teacher-1", name: "Updated", phone_number: "918888888882" };
      apiFetch.mockResolvedValue(mockResponse);

      const result = await teacherService.updateTeacher(
        "teacher-1",
        "  Updated  ",
        "  918888888882  ",
        "",
        {}
      );

      expect(apiFetch).toHaveBeenCalledWith("http://test-api/teacher/teacher-1", {
        method: "PATCH",
        headers: {},
        body: JSON.stringify({
          name: "Updated",
          phone_number: "918888888882",
        }),
      });
      expect(result.name).toBe("Updated");
      expect(result.phone_number).toBe("918888888882");
    });

    test("includes password when present", async () => {
      apiFetch.mockResolvedValue({});
      await teacherService.updateTeacher("te1", "N", "1", "secret", mockHeaders);
      expect(JSON.parse(apiFetch.mock.calls[0][1].body).password).toBe("secret");
    });

    test("handles undefined name/phone", async () => {
      apiFetch.mockResolvedValue({});
      await teacherService.updateTeacher("te1", undefined, undefined, undefined, mockHeaders);
      expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({ name: "", phone_number: "" });
    });
  });

  describe("getTeachers", () => {
    test("returns SchoolTeacherDto list from the raw array response", async () => {
      apiFetch.mockResolvedValue([{ id: "te1", name: "N", phone_number: "911111111111", role: "teacher" }]);
      const result = await teacherService.getTeachers(mockHeaders);
      expect(result[0].id).toBe("te1");
      expect(result[0].phone_number).toBe("911111111111");
    });
  });

  describe("registerTeacher", () => {
    test("POSTs body and returns a TeacherDto", async () => {
      apiFetch.mockResolvedValue({ id: "te1", name: "N", phone_number: "1", role: "teacher" });
      const result = await teacherService.registerTeacher("1", "p", "N", "teacher", mockHeaders);
      const opts = apiFetch.mock.calls[0][1];
      expect(JSON.parse(opts.body)).toEqual({
        phone_number: "1",
        password: "p",
        name: "N",
        role: "teacher",
      });
      expect(result.id).toBe("te1");
    });
  });

  describe("getStudents", () => {
    test("returns StudentDto list from apiFetch", async () => {
      apiFetch.mockResolvedValue([{ id: "st1", name: "S", phone_number: "922222222222" }]);
      const result = await teacherService.getStudents(mockHeaders);
      expect(result[0].id).toBe("st1");
      expect(result[0].phone_number).toBe("922222222222");
    });
  });

  describe("deleteStudentById", () => {
    test("calls DELETE method", async () => {
      apiFetch.mockResolvedValue({});
      await teacherService.deleteStudentById("st1", mockHeaders);
      expect(apiFetch.mock.calls[0][1].method).toBe("DELETE");
    });
  });

  describe("deleteTeacher", () => {
    test("calls DELETE method", async () => {
      apiFetch.mockResolvedValue({});
      await teacherService.deleteTeacher("te1", mockHeaders);
      expect(apiFetch.mock.calls[0][1].method).toBe("DELETE");
    });
  });

  describe("transferTeacher", () => {
    test("POSTs teacherId and targetSchoolId, returns TeacherDto", async () => {
      apiFetch.mockResolvedValue({
        message: "ok",
        teacher: { id: "te1", name: "N", phone_number: "1", role: "teacher" },
      });
      const result = await teacherService.transferTeacher("te1", "s2", mockHeaders);
      expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
        teacher_id: "te1",
        target_school_id: "s2",
      });
      expect(result.teacher.id).toBe("te1");
    });
  });
});
