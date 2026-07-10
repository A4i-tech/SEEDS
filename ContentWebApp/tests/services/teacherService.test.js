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
      const mockResponse = { _id: "s1", name: "A", phoneNumber: "911111111111" };
      apiFetch.mockResolvedValue(mockResponse);

      const result = await teacherService.createStudent("A", "911111111111", {
        Authorization: "Bearer x",
      });

      expect(apiFetch).toHaveBeenCalledWith("http://test-api/student", {
        method: "POST",
        headers: { Authorization: "Bearer x" },
        body: JSON.stringify({
          name: "A",
          phoneNumber: "911111111111",
        }),
      });
      expect(result).toEqual(mockResponse);
    });

    test("returns created student on success", async () => {
      const mockResponse = { _id: "s2", name: "New", phoneNumber: "912222222222" };
      apiFetch.mockResolvedValue(mockResponse);

      const result = await teacherService.createStudent("New", "912222222222", {});

      expect(result).toEqual(mockResponse);
    });
  });

  describe("updateStudentById", () => {
    test("calls apiFetch with PATCH and correct body", async () => {
      const mockResponse = { name: "Updated", phoneNumber: "918888888882" };
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
          phoneNumber: "918888888882",
        }),
      });
      expect(result).toEqual(mockResponse);
    });

    test("returns updated student on success", async () => {
      apiFetch.mockResolvedValue({ name: "NewName", phoneNumber: "917777777777" });

      const result = await teacherService.updateStudentById(
        "916666666666",
        "NewName",
        "917777777777",
        {}
      );

      expect(result).toEqual({ name: "NewName", phoneNumber: "917777777777" });
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
      const mockResponse = { name: "Updated", phoneNumber: "918888888882" };
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
          phoneNumber: "918888888882",
        }),
      });
      expect(result).toEqual(mockResponse);
    });

    test("includes password when present", async () => {
      apiFetch.mockResolvedValue({});
      await teacherService.updateTeacher("te1", "N", "1", "secret", mockHeaders);
      expect(JSON.parse(apiFetch.mock.calls[0][1].body).password).toBe("secret");
    });

    test("handles undefined name/phone", async () => {
      apiFetch.mockResolvedValue({});
      await teacherService.updateTeacher("te1", undefined, undefined, undefined, mockHeaders);
      expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({ name: "", phoneNumber: "" });
    });
  });

  describe("getTeachers", () => {
    test("returns response.data", async () => {
      apiFetch.mockResolvedValue({ data: [{ id: "te1" }] });
      await expect(teacherService.getTeachers(mockHeaders)).resolves.toEqual([{ id: "te1" }]);
    });

    test("falls back to the bare response when no data field", async () => {
      apiFetch.mockResolvedValue([{ id: "te2" }]);
      await expect(teacherService.getTeachers()).resolves.toEqual([{ id: "te2" }]);
    });
  });

  describe("registerTeacher", () => {
    test("POSTs body", async () => {
      apiFetch.mockResolvedValue({ ok: true });
      await teacherService.registerTeacher("1", "p", "N", "teacher", mockHeaders);
      const opts = apiFetch.mock.calls[0][1];
      expect(JSON.parse(opts.body)).toEqual({
        phoneNumber: "1",
        password: "p",
        name: "N",
        role: "teacher",
      });
    });
  });

  describe("getStudents", () => {
    test("returns list from apiFetch", async () => {
      apiFetch.mockResolvedValue([{ id: "st1" }]);
      await expect(teacherService.getStudents(mockHeaders)).resolves.toEqual([{ id: "st1" }]);
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
    test("POSTs teacherId and targetSchoolId", async () => {
      apiFetch.mockResolvedValue({});
      await teacherService.transferTeacher("te1", "s2", mockHeaders);
      expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
        teacherId: "te1",
        targetSchoolId: "s2",
      });
    });
  });
});
