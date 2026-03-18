const websocketService = require("../../src/services/websocketService");
const azureBlobService = require("../../src/services/azureBlobService");
const connectionManager = require("../../src/services/connectionManager");
const { PlaybackStatus } = require("../../src/constants");

// Mock dependencies
jest.mock("../../src/services/azureBlobService");
jest.mock("../../src/services/connectionManager");

describe("WebSocketService", () => {
  let mockWebSocket;
  let mockConnection;
  let mockState;
  let mockControlConnection;
  let mockControlWebSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock WebSocket
    mockWebSocket = {
      readyState: 1, // OPEN
      OPEN: 1,
      CLOSED: 3,
      send: jest.fn(),
      close: jest.fn(),
    };

    // Mock control WebSocket
    mockControlWebSocket = {
      readyState: 1,
      OPEN: 1,
      send: jest.fn(),
      close: jest.fn(),
    };

    // Mock connection state
    mockState = {
      id: "test-client",
      playing: false,
      position: 0,
      isClosed: false,
      playbackId: 0,
      currentAudioType: null,
      audioContentState: null,
      systemAudioContentQueue: [],
    };

    // Mock connection
    mockConnection = {
      ws: mockWebSocket,
      state: mockState,
    };

    // Mock control connection
    mockControlConnection = {
      ws: mockControlWebSocket,
      state: { id: "confv2server" },
    };

    // Mock connectionManager
    connectionManager.getConnection.mockImplementation((id) => {
      if (id === "confv2server") return mockControlConnection;
      if (id === "test-client") return mockConnection;
      return undefined;
    });

    // Mock azureBlobService
    azureBlobService.getBlobData.mockResolvedValue(
      Buffer.from("mock audio data")
    );

    // Set up default mock for WebSocket send
    mockWebSocket.send.mockImplementation((data, options, callback) => {
      // Store callback but don't call it automatically
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("playAudioContent", () => {
    const testBlobUrl = "https://storage.example.com/container/audio.wav";

    it("should handle successful playback and state management", async () => {
      mockState.playbackId = 5;
      mockState.audioContentState = { blobUrl: "old-url", position: 100 };

      await websocketService.playAudioContent("test-client", testBlobUrl);

      expect(connectionManager.getConnection).toHaveBeenCalledWith(
        "test-client"
      );
      expect(azureBlobService.getBlobData).toHaveBeenCalledWith(
        "container",
        "audio.wav"
      );
      expect(mockState.audioContentState.blobUrl).toBe(testBlobUrl);
      expect(mockState.audioContentState.playing).toBe(true);
      expect(mockState.currentAudioType).toBe("audioContent");
      expect(mockState.playbackId).toBe(6);
      expect(mockState.audioContentState.position).not.toBe(100);
    });

    it("should handle errors and URL parsing", async () => {
      // Test non-existent connection
      connectionManager.getConnection.mockReturnValue(undefined);
      await expect(
        websocketService.playAudioContent("non-existent", testBlobUrl)
      ).rejects.toThrow("WebSocket connection not found");

      // Reset mocks and test closed WebSocket
      connectionManager.getConnection.mockReturnValue(mockConnection);
      mockWebSocket.readyState = 3;
      await expect(
        websocketService.playAudioContent("test-client", testBlobUrl)
      ).rejects.toThrow("WebSocket is not open");
      mockWebSocket.readyState = 1;

      // Test nested folder URL parsing
      const nestedUrl =
        "https://storage.example.com/container/folder/subfolder/audio.wav";
      await websocketService.playAudioContent("test-client", nestedUrl);
      expect(azureBlobService.getBlobData).toHaveBeenCalledWith(
        "container",
        "folder/subfolder/audio.wav"
      );
    });
  });

  describe("playSystemAudioContent", () => {
    const testBlobUrl =
      "https://storage.example.com/container/system-audio.wav";

    it("should handle system audio queuing and state management", async () => {
      // Test audio content pausing
      mockState.currentAudioType = "audioContent";
      mockState.audioContentState = {
        playing: true,
        blobUrl: "test-url",
        position: 50,
      };
      await websocketService.playSystemAudioContent("test-client", testBlobUrl);
      expect(mockState.currentAudioType).toBe("systemAudioContent");
      expect(mockState.audioContentState.playing).toBe(false);
      expect(mockControlWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          websocket_id: "test-client",
          type: "playback-state-update",
          message: PlaybackStatus.PAUSED,
          position_seconds: 0,
          duration_seconds: 0,
          speed: 1,
        }),
        expect.any(Function)
      );

      // Test multiple system audio queuing (reset to queuing state)
      mockState.systemAudioContentQueue = [{ blobUrl: testBlobUrl }];
      const secondUrl =
        "https://storage.example.com/container/system-audio-2.wav";
      await websocketService.playSystemAudioContent("test-client", secondUrl);
      expect(mockState.systemAudioContentQueue).toHaveLength(2);
      expect(mockState.systemAudioContentQueue[0].blobUrl).toBe(testBlobUrl);

      // Test queue initialization
      delete mockState.systemAudioContentQueue;
      await websocketService.playSystemAudioContent("test-client", testBlobUrl);
      expect(mockState.systemAudioContentQueue).toBeDefined();
    });
  });

  describe("control methods", () => {
    it("should handle pause, resume, stop, close, and reconnection", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      // Test pause
      mockState.currentAudioType = "audioContent";
      mockState.audioContentState = { playing: true };
      websocketService.pauseAudioContent("test-client");
      expect(mockState.audioContentState.playing).toBe(false);
      expect(mockControlWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          websocket_id: "test-client",
          type: "playback-state-update",
          message: PlaybackStatus.PAUSED,
          position_seconds: 0,
          duration_seconds: 0,
          speed: 1,
        }),
        expect.any(Function)
      );

      // Test pause with system audio (should not pause)
      mockState.currentAudioType = "systemAudioContent";
      websocketService.pauseAudioContent("test-client");

      // Test resume with system audio (should ignore)
      websocketService.resumeAudioContent("test-client");
      expect(consoleSpy).toHaveBeenCalledWith(
        "Resume request ignored for ID: test-client; system audio content is playing or queued"
      );

      // Test stop
      mockState.audioContentState = { playing: true, position: 100 };
      websocketService.stopAudioContent("test-client");
      expect(mockState.audioContentState.playing).toBe(false);
      expect(mockState.audioContentState.position).toBe(0);
      expect(mockState.currentAudioType).toBe(null);

      // Test close
      websocketService.closeConnection("test-client");
      expect(mockState.isClosed).toBe(true);
      expect(mockWebSocket.close).toHaveBeenCalled();

      // Test reconnection
      websocketService.handleAccidentalDisconnection("test-client");
      expect(mockControlWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ websocket_id: "test-client", type: "RECONNECT" }),
        expect.any(Function)
      );

      // Test error cases
      connectionManager.getConnection.mockReturnValue(undefined);
      expect(() => websocketService.pauseAudioContent("non-existent")).toThrow(
        "WebSocket connection not found"
      );

      // Reset connection and test resume error
      connectionManager.getConnection.mockReturnValue(mockConnection);
      mockState.audioContentState = null;
      expect(() => websocketService.resumeAudioContent("test-client")).toThrow(
        "No audio content data to resume"
      );

      consoleSpy.mockRestore();
    });

    it("should handle seek requests and clamp positions", async () => {
      const controlSpy = jest.spyOn(console, "log").mockImplementation();
      mockState.audioContentState = {
        position: 3200,
        playing: true,
        blobData: Buffer.alloc(64000),
      };
      mockState.currentAudioType = "audioContent";

      await websocketService.seekAudioContent("test-client", {
        deltaSeconds: 2,
      });
      const expectedTarget = 3200 + 32000;
      expect(mockState.audioContentState.position).toBeGreaterThanOrEqual(
        expectedTarget
      );
      expect(mockState.audioContentState.position).toBeLessThanOrEqual(
        expectedTarget + 320
      );
      expect(mockState.playbackId).toBe(1);
      expect(mockControlWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          websocket_id: "test-client",
          type: "playback-state-update",
          message: PlaybackStatus.PLAYING,
          position_seconds: 2.2,
          duration_seconds: 4,
          speed: 1,
        }),
        expect.any(Function)
      );

      // Clamp beyond buffer length and ensure we do not restart playback while system audio is active
      mockState.currentAudioType = "systemAudioContent";
      await websocketService.seekAudioContent("test-client", {
        deltaSeconds: 999,
      });
      expect(mockState.audioContentState.position).toBe(
        mockState.audioContentState.blobData.length
      );
      expect(mockControlWebSocket.send).toHaveBeenCalledTimes(1);

      // Negative clamp
      await websocketService.seekAudioContent("test-client", {
        deltaSeconds: -999,
      });
      expect(mockState.audioContentState.position).toBe(0);

      controlSpy.mockRestore();
    });
  });

  describe("streaming and error handling", () => {
    it("should handle audio streaming with timing and error scenarios", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Test successful streaming with position updates
      const testData = Buffer.alloc(640, "a");
      azureBlobService.getBlobData.mockResolvedValue(testData);
      mockWebSocket.send.mockImplementation((data, options, callback) => {
        setTimeout(() => callback && callback(), 0);
      });
      await websocketService.playAudioContent(
        "test-client",
        "https://storage.example.com/container/test.wav"
      );
      jest.advanceTimersByTime(50);
      expect(mockState.audioContentState.position).toBe(640);

      // Test streaming completion
      const smallData = Buffer.alloc(320, "a");
      azureBlobService.getBlobData.mockResolvedValue(smallData);
      await websocketService.playAudioContent(
        "test-client",
        "https://storage.example.com/container/test.wav"
      );
      jest.advanceTimersByTime(50);
      expect(mockState.audioContentState.playing).toBe(false);
      expect(mockState.currentAudioType).toBe(null);

      // Test send errors
      const testError = new Error("Send error");
      mockWebSocket.send.mockImplementation((data, options, callback) => {
        setTimeout(() => callback && callback(testError), 0);
      });
      await websocketService.playAudioContent(
        "test-client",
        "https://storage.example.com/container/test.wav"
      );
      jest.advanceTimersByTime(50);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error sending data over WebSocket for ID: test-client",
        testError
      );
      expect(mockWebSocket.close).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle edge cases and service errors", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Test Azure blob service errors
      const blobError = new Error("Blob service error");
      azureBlobService.getBlobData.mockRejectedValue(blobError);
      await expect(
        websocketService.playAudioContent(
          "test-client",
          "https://storage.example.com/container/test.wav"
        )
      ).rejects.toThrow("Blob service error");
      azureBlobService.getBlobData.mockResolvedValue(
        Buffer.from("mock audio data")
      );

      // Test control WebSocket errors
      const controlError = new Error("Control send error");
      mockControlWebSocket.send.mockImplementation((data, callback) =>
        callback(controlError)
      );
      mockState.currentAudioType = "audioContent";
      mockState.audioContentState = { playing: true };
      websocketService.pauseAudioContent("test-client");
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error sending playback status over WebSocket for ID: test-client",
        controlError
      );
      mockControlWebSocket.send.mockImplementation(
        (data, callback) => callback && callback()
      );

      // Test missing control connection error handling
      connectionManager.getConnection.mockImplementation((id) => {
        if (id === "confv2server") return undefined;
        if (id === "test-client") return mockConnection;
        return undefined;
      });
      try {
        websocketService.pauseAudioContent("test-client");
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Seek errors
      await expect(
        websocketService.seekAudioContent("missing", { deltaSeconds: 1 })
      ).rejects.toThrow("WebSocket connection not found");
      connectionManager.getConnection.mockReturnValue(mockConnection);
      mockState.audioContentState = null;
      await expect(
        websocketService.seekAudioContent("test-client", { deltaSeconds: 1 })
      ).rejects.toThrow("No audio content data to seek");
      mockState.audioContentState = {
        blobData: Buffer.alloc(1000),
        position: 0,
      };
      await expect(
        websocketService.seekAudioContent("test-client", {})
      ).rejects.toThrow("Seek payload must include deltaSeconds");

      consoleSpy.mockRestore();
    });
  });
});
