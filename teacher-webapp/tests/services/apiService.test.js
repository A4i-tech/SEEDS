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

      const result = await apiService.createConference(phoneNumber, studentPhones);

      expectFetchCall(`${baseUrl}/conference/create`, "POST", {
        teacher_phone: "91" + phoneNumber,
        student_phones: studentPhones.map((phone) => "91" + phone),
      });
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
      expectFetchCall(
        `${baseUrl}/conference/muteparticipant/${confId}?phone_number=${"91" + phoneNumber}`,
        "PUT"
      );
    });

    test("unmutes participant", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.unmuteParticipant(confId, phoneNumber);
      expectFetchCall(
        `${baseUrl}/conference/unmuteparticipant/${confId}?phone_number=${"91" + phoneNumber}`,
        "PUT"
      );
    });

    test("adds participant to conference", async () => {
      const mockResponse = { data: {} };
      axiosInstance.put.mockResolvedValueOnce(mockResponse);

      await apiService.addParticipant(confId, phoneNumber);
      expectFetchCall(
        `${baseUrl}/conference/addparticipant/${confId}?phone_number=${"91" + phoneNumber}`,
        "PUT"
      );
    });

    test("removes participant from conference", async () => {
      fetch.mockResolvedValueOnce(mockEmptyResponse());
      const result = await apiService.removeParticipant(confId, phoneNumber);
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/conference/removeparticipant/${confId}?phone_number=${"91" + phoneNumber}`,
        { method: "PUT", headers: { "Content-Type": "application/json" } }
      );
      expect(result).toEqual({});
    });

    test("removeParticipant normalizes phone number", async () => {
      fetch.mockResolvedValueOnce(mockEmptyResponse());
      await apiService.removeParticipant(confId, "9876543210");
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/conference/removeparticipant/${confId}?phone_number=919876543210`,
        { method: "PUT", headers: { "Content-Type": "application/json" } }
      );
    });

    test("removeParticipant throws on HTTP error", async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: jest.fn().mockResolvedValueOnce({}),
        text: jest.fn().mockResolvedValueOnce("Forbidden"),
      });
      await expect(apiService.removeParticipant(confId, phoneNumber)).rejects.toThrow(
        "Failed to remove participant: 403 Forbidden"
      );
    });
  });

  describe("Audio Control", () => {
    test("plays, pauses, resumes, and seeks audio (each call uses correct request)", async () => {
      const expectedUrl = "https://testaccount.blob.core.windows.net/output-container/25/1.0.wav";

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

      expect(fetch).toHaveBeenNthCalledWith(2, `${baseUrl}/conference/pauseaudio/${confId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });

      expect(fetch).toHaveBeenNthCalledWith(3, `${baseUrl}/conference/resumeaudio/${confId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });

      await apiService.seekAudio(confId, 15);

      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringContaining(`/conference/seekaudio/${confId}?delta_seconds=15`)
      );
    });
  });

  describe("Error Handling", () => {
    test("handles network errors", async () => {
      fetch.mockRejectedValueOnce(new Error("Network error"));
      await expect(apiService.createConference("123", ["456"])).rejects.toThrow("Network error");
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

    test("handles JSON parsing errors", async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockRejectedValueOnce(new Error("Invalid JSON")),
        text: jest.fn().mockResolvedValueOnce(""),
      });
      await expect(apiService.createConference("123", ["456"])).rejects.toThrow("Invalid JSON");
    });
  });
});
