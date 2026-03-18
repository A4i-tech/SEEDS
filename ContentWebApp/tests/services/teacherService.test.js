import { teacherService } from "../../src/services/teacherService";
import { apiFetch } from "../../src/services/api";

jest.mock("../../src/services/api");
jest.mock("../../src/Constants", () => ({ SEEDS_URL: "http://test-api" }));

describe("teacherService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("addStudents", () => {
    test("calls apiFetch with POST to add-students and correct body", async () => {
      const mockResponse = { students: [{ name: "A", phoneNumber: "911111111111" }] };
      apiFetch.mockResolvedValue(mockResponse);

      const result = await teacherService.addStudents(
        "919876543210",
        [{ name: "A", phoneNumber: "911111111111" }],
        { Authorization: "Bearer x" }
      );

      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(apiFetch).toHaveBeenCalledWith("http://test-api/v1/teacher/add-students", {
        method: "POST",
        headers: { Authorization: "Bearer x" },
        body: JSON.stringify({
          phoneNumber: "919876543210",
          students: [{ name: "A", phoneNumber: "911111111111" }],
        }),
      });
      expect(result).toEqual(mockResponse);
    });

    test("returns response with students, duplicates and alreadyLinked when present", async () => {
      const mockResponse = {
        students: [{ name: "New", phoneNumber: "912222222222" }],
        duplicates: [{ phoneNumber: "913333333333", existingName: "Old", submittedName: "NewName" }],
        alreadyLinked: [{ name: "Already", phoneNumber: "914444444444" }],
      };
      apiFetch.mockResolvedValue(mockResponse);

      const result = await teacherService.addStudents("919876543210", [], {});

      expect(result).toEqual(mockResponse);
      expect(result.students).toHaveLength(1);
      expect(result.duplicates).toHaveLength(1);
      expect(result.alreadyLinked).toHaveLength(1);
    });
  });

  describe("updateStudent", () => {
    test("calls apiFetch with PATCH and correct body with trimmed name and phone", async () => {
      const mockResponse = { name: "Updated", phoneNumber: "918888888882" };
      apiFetch.mockResolvedValue(mockResponse);

      const result = await teacherService.updateStudent(
        "919876543210",
        "918888888881",
        "  Updated  ",
        "  918888888882  ",
        {}
      );

      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(apiFetch).toHaveBeenCalledWith("http://test-api/v1/teacher/students", {
        method: "PATCH",
        headers: {},
        body: JSON.stringify({
          phoneNumber: "919876543210",
          currentPhoneNumber: "918888888881",
          name: "Updated",
          studentPhoneNumber: "918888888882",
        }),
      });
      expect(result).toEqual(mockResponse);
    });

    test("returns updated student on success", async () => {
      apiFetch.mockResolvedValue({ name: "NewName", phoneNumber: "917777777777" });

      const result = await teacherService.updateStudent(
        "919876543210",
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
        teacherService.updateStudent("919876543210", "916666666666", "Name", "917777777777", {})
      ).rejects.toMatchObject({ status: 409, message: "Conflict" });
    });
  });
});
