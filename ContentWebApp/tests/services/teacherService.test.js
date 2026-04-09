import { teacherService } from "../../src/services/teacherService";
import { apiFetch } from "../../src/services/api";

jest.mock("../../src/services/api");
jest.mock("../../src/Constants", () => ({ SEEDS_URL: "http://test-api" }));

describe("teacherService", () => {
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
  });
});
