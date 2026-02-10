import * as apiService from "../../src/services/apiService";
// Mock fetch globally
global.fetch = jest.fn();

// Mock environment variables
process.env.REACT_APP_CONF_SERVER_BASE_URI = "http://localhost:3001";
process.env.REACT_APP_STORAGE_ACCOUNT_NAME = "testaccount";

describe("apiService", () => {
  const mockSuccessResponse = () => ({
    ok: true,
    json: jest.fn().mockResolvedValueOnce({ id: "conf-123" }),
    text: jest.fn().mockResolvedValueOnce(""),
  });
  const mockEmptyResponse = () => ({
    ok: true,
    json: jest.fn().mockResolvedValueOnce({}),
    text: jest.fn().mockResolvedValueOnce(""),
  });
  const confId = "conf-123";
  const phoneNumber = "1234567890";
  const baseUrl = process.env.REACT_APP_CONF_SERVER_BASE_URI;

  const expectFetchCall = (url, method = "POST", body = null) => {
    const config = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) config.body = JSON.stringify(body);
    expect(fetch).toHaveBeenCalledWith(url, config);
  };

  beforeEach(() => {
    fetch.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Conference Management", () => {
    test("creates conference with correct payload", async () => {
      fetch.mockResolvedValueOnce(mockSuccessResponse());
      const studentPhones = ["0987654321", "1122334455"];

      const result = await apiService.createConference(phoneNumber, studentPhones);

      expectFetchCall(`${baseUrl}/conference/create`, "POST", {
        teacher_phone: "91" + phoneNumber,
        student_phones: studentPhones.map((phone) => "91" + phone),
      });
      expect(result).toEqual({ id: "conf-123" });
    });

    test("starts conference call", async () => {
      fetch.mockResolvedValueOnce(mockEmptyResponse());
      await apiService.startConferenceCall(confId);
      expectFetchCall(`${baseUrl}/conference/start/${confId}`);
    });

    test("ends conference call", async () => {
      fetch.mockResolvedValueOnce(mockEmptyResponse());
      await apiService.endConferenceCall(confId);
      expectFetchCall(`${baseUrl}/conference/end/${confId}`, "PUT");
    });

    test("sinks conference call", async () => {
      fetch.mockResolvedValueOnce(mockEmptyResponse());
      await apiService.sinkConferenceCall(confId);
      expectFetchCall(`${baseUrl}/conference/sink/${confId}`, "PUT");
    });
  });

  describe("Participant Management", () => {
    test("mutes and unmutes participants", async () => {
      fetch.mockResolvedValueOnce(mockEmptyResponse());
      await apiService.muteParticipant(confId, phoneNumber);
      expectFetchCall(
        `${baseUrl}/conference/muteparticipant/${confId}?phone_number=${"91" + phoneNumber}`,
        "PUT"
      );

      fetch.mockResolvedValueOnce(mockEmptyResponse());
      await apiService.unmuteParticipant(confId, phoneNumber);
      expectFetchCall(
        `${baseUrl}/conference/unmuteparticipant/${confId}?phone_number=${"91" + phoneNumber}`,
        "PUT"
      );
    });

    test("adds participant to conference", async () => {
      fetch.mockResolvedValueOnce(mockEmptyResponse());
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

      // Play
      fetch.mockResolvedValueOnce(mockEmptyResponse());
      await apiService.playAudio(confId);

      // Pause
      fetch.mockResolvedValueOnce(mockEmptyResponse());
      await apiService.pauseAudio(confId);

      // Resume
      fetch.mockResolvedValueOnce(mockEmptyResponse());
      await apiService.resumeAudio(confId);

      // Seek
      fetch.mockResolvedValueOnce(mockEmptyResponse());
      await apiService.seekAudio(confId, 15);

      // Verify the sequence of fetch calls and their args
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        `${baseUrl}/conference/playaudio/${confId}?url=${expectedUrl}`,
        { method: "PUT", headers: { "Content-Type": "application/json" } }
      );

      expect(fetch).toHaveBeenNthCalledWith(2, `${baseUrl}/conference/pauseaudio/${confId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });

      expect(fetch).toHaveBeenNthCalledWith(3, `${baseUrl}/conference/resumeaudio/${confId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });

      expect(fetch).toHaveBeenNthCalledWith(
        4,
        `${baseUrl}/conference/seekaudio/${confId}?delta_seconds=15`,
        { method: "PUT", headers: { "Content-Type": "application/json" } }
      );
    });
  });

  describe("Error Handling", () => {
    test("handles network errors", async () => {
      fetch.mockRejectedValueOnce(new Error("Network error"));
      await expect(apiService.createConference("123", ["456"])).rejects.toThrow("Network error");
    });

    test("handles HTTP error responses", async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: jest.fn().mockResolvedValueOnce({}),
        text: jest.fn().mockResolvedValueOnce("Error message"),
      });
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
