import * as apiService from "../../src/services/apiService";
import axiosInstance from "../../src/services/axiosInstance";

// Mock axios instance
jest.mock("../../src/services/axiosInstance");

// Mock environment variables
process.env.REACT_APP_CONF_SERVER_BASE_URI = "http://localhost:3001";
process.env.REACT_APP_STORAGE_ACCOUNT_NAME = "testaccount";

describe("apiService", () => {
  const confId = "conf-123";
  const phoneNumber = "1234567890";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Conference Management", () => {
    test("creates conference with correct payload", async () => {
      const mockResponse = { data: { id: "conf-123" } };
      axiosInstance.post.mockResolvedValueOnce(mockResponse);

      const studentPhones = ["0987654321", "1122334455"];
      const result = await apiService.createConference(phoneNumber, studentPhones);

      expect(axiosInstance.post).toHaveBeenCalledWith(
        expect.stringContaining("/conference/create"),
        {
          teacher_phone: phoneNumber,
          student_phones: studentPhones,
        }
      );
      expect(result).toEqual({ id: "conf-123" });
    });

    test("starts conference call", async () => {
      const mockResponse = { data: {} };
      axiosInstance.post.mockResolvedValueOnce(mockResponse);

      await apiService.startConferenceCall(confId);

      expect(axiosInstance.post).toHaveBeenCalledWith(
        expect.stringContaining(`/conference/start/${confId}`)
      );
    });

    test("ends conference call", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.endConferenceCall(confId);

      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringContaining(`/conference/end/${confId}`)
      );
    });

    test("endConferenceCall throws on timeout", async () => {
      const timeoutError = new Error("Request timed out. Please try again.");
      timeoutError.code = "ECONNABORTED";
      axiosInstance.put.mockRejectedValueOnce(timeoutError);

      await expect(apiService.endConferenceCall(confId)).rejects.toThrow(
        "End conference timed out. Please try again."
      );
    });

    test("endConferenceCall throws on server error", async () => {
      const serverError = new Error("Server Error");
      serverError.response = {
        status: 500,
        statusText: "Internal Server Error",
        data: "Error",
      };
      axiosInstance.put.mockRejectedValueOnce(serverError);

      await expect(apiService.endConferenceCall(confId)).rejects.toThrow(
        "Failed to end conference: 500 Internal Server Error"
      );
    });

    test("sinks conference call", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.sinkConferenceCall(confId);

      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringContaining(`/conference/sink/${confId}`)
      );
    });
  });

  describe("Participant Management", () => {
    test("mutes participant", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.muteParticipant(confId, phoneNumber);

      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringContaining(
          `/conference/muteparticipant/${confId}?phone_number=${phoneNumber}`
        )
      );
    });

    test("unmutes participant", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.unmuteParticipant(confId, phoneNumber);

      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringContaining(
          `/conference/unmuteparticipant/${confId}?phone_number=${phoneNumber}`
        )
      );
    });

    test("adds participant to conference", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.addParticipant(confId, phoneNumber);

      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringContaining(
          `/conference/addparticipant/${confId}?phone_number=${phoneNumber}`
        )
      );
    });
  });

  describe("Audio Control", () => {
    test("plays audio with default URL", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.playAudio(confId);

      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringContaining(`/conference/playaudio/${confId}`)
      );
    });

    test("pauses audio", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.pauseAudio(confId);

      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringContaining(`/conference/pauseaudio/${confId}`)
      );
    });

    test("resumes audio", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.resumeAudio(confId);

      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringContaining(`/conference/resumeaudio/${confId}`)
      );
    });

    test("seeks audio", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.seekAudio(confId, 15);

      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringContaining(`/conference/seekaudio/${confId}?delta_seconds=15`)
      );
    });
  });

  describe("Error Handling", () => {
    test("handles network errors", async () => {
      const networkError = new Error("Network Error");
      networkError.code = "ERR_NETWORK";
      axiosInstance.post.mockRejectedValueOnce(networkError);

      await expect(apiService.createConference("123", ["456"])).rejects.toThrow(
        "Failed to create conference: Network error Network Error"
      );
    });

    test("handles HTTP error responses", async () => {
      const httpError = new Error("Bad Request");
      httpError.response = {
        status: 400,
        statusText: "Bad Request",
        data: "Error message",
      };
      axiosInstance.post.mockRejectedValueOnce(httpError);

      await expect(apiService.createConference("123", ["456"])).rejects.toThrow(
        "Failed to create conference: 400 Bad Request"
      );
    });

    test("handles timeout errors for createConference", async () => {
      const timeoutError = new Error("Request timed out. Please try again.");
      timeoutError.code = "ECONNABORTED";
      axiosInstance.post.mockRejectedValueOnce(timeoutError);

      await expect(apiService.createConference("123", ["456"])).rejects.toThrow(
        "Conference start timed out. Please try again."
      );
    });
  });
});
