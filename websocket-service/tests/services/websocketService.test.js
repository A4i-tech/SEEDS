const websocketService = require("../../src/services/websocketService");
const azureBlobService = require("../../src/services/azureBlobService");
const connectionManager = require("../../src/services/connectionManager");
const logger = require("../../src/logger");
const { PlaybackStatus } = require("../../src/constants");

const AUDIO_BYTES_PER_SECOND = 16000;

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

    it("persists previously set speed across a new playAudioContent call", async () => {
      mockState.speed = 1.5;
      azureBlobService.getBlobData
        .mockResolvedValueOnce(Buffer.alloc(32000)) // base 1.0x blob
        .mockResolvedValueOnce(Buffer.alloc(21000)); // 1.5x variant blob

      await websocketService.playAudioContent("test-client", testBlobUrl);

      expect(azureBlobService.getBlobData).toHaveBeenNthCalledWith(
        2,
        "container",
        "audio__speed_1.5.wav"
      );
      expect(mockState.audioContentState.speed).toBe(1.5);
      expect(mockState.audioContentState.blobData.length).toBe(21000);
    });

    it("falls back to 1.0x when the requested variant blob is missing", async () => {
      mockState.speed = 1.5;
      azureBlobService.getBlobData
        .mockResolvedValueOnce(Buffer.alloc(32000)) // base 1.0x blob
        .mockRejectedValueOnce(new Error("blob not found")); // 1.5x variant missing

      await websocketService.playAudioContent("test-client", testBlobUrl);

      expect(mockState.audioContentState.speed).toBe(1.0);
      expect(mockState.audioContentState.blobData.length).toBe(32000);
    });

    it("does not reset speed to 1.0 when no speed was previously set", async () => {
      delete mockState.speed;
      azureBlobService.getBlobData.mockResolvedValueOnce(Buffer.alloc(32000));

      await websocketService.playAudioContent("test-client", testBlobUrl);

      expect(mockState.audioContentState.speed).toBe(1.0);
      expect(azureBlobService.getBlobData).toHaveBeenCalledTimes(1);
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
      const consoleSpy = jest.spyOn(logger, "info").mockImplementation();

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
      const controlSpy = jest.spyOn(logger, "info").mockImplementation();
      mockState.audioContentState = {
        position: 3200,
        playing: true,
        blobData: Buffer.alloc(64000),
        baseDurationSeconds: 4,
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

    test("absolute seek at 1.5x converts logical seconds to variant-local bytes", async () => {
      mockState.audioContentState = {
        blobData: Buffer.alloc(24000), // 1.5x variant, 1.5s local runtime
        position: 0,
        playing: false,
        speed: 1.5,
        baseDurationSeconds: 3.0, // 3s of logical/original content
      };
      mockState.currentAudioType = "audioContent";

      await websocketService.seekAudioContent("test-client", { positionSeconds: 1.5 });

      // 1.5 logical seconds at 1.5x -> 1.0 variant-local second -> 16000 bytes
      expect(mockState.audioContentState.position).toBeGreaterThanOrEqual(16000);
      expect(mockState.audioContentState.position).toBeLessThanOrEqual(16320);
    });

    test("relative seek adds delta to current logical position before converting", async () => {
      mockState.audioContentState = {
        blobData: Buffer.alloc(24000),
        position: 8000, // 0.5 variant-local seconds elapsed
        playing: false,
        speed: 1.5,
        baseDurationSeconds: 3.0,
      };
      mockState.currentAudioType = "audioContent";

      // current logical position = 0.5 * 1.5 = 0.75s; +1s delta = 1.75s logical
      await websocketService.seekAudioContent("test-client", { deltaSeconds: 1.0 });

      const expectedTarget = (1.75 / 1.5) * AUDIO_BYTES_PER_SECOND;
      expect(mockState.audioContentState.position).toBeGreaterThanOrEqual(expectedTarget);
      expect(mockState.audioContentState.position).toBeLessThanOrEqual(expectedTarget + 320);
    });

    test("seek clamps to the logical (base) duration, not the variant length", async () => {
      mockState.audioContentState = {
        blobData: Buffer.alloc(24000),
        position: 0,
        playing: false,
        speed: 1.5,
        baseDurationSeconds: 3.0,
      };
      mockState.currentAudioType = "audioContent";

      await websocketService.seekAudioContent("test-client", { positionSeconds: 100 });

      expect(mockState.audioContentState.position).toBeCloseTo(mockState.audioContentState.blobData.length, 0);
    });

    test("reports logical position and base duration when a non-1.0x variant is playing", () => {
      mockState.audioContentState = {
        blobData: Buffer.alloc(24000),
        position: 16000, // 1.0 variant-local second
        playing: true,
        speed: 1.5,
        baseDurationSeconds: 3.0,
      };
      mockState.currentAudioType = "audioContent";

      websocketService.pauseAudioContent("test-client");

      const sentPayload = JSON.parse(mockControlWebSocket.send.mock.calls[0][0]);
      expect(sentPayload.position_seconds).toBeCloseTo(1.5, 2); // 1.0s local * 1.5 speed
      expect(sentPayload.duration_seconds).toBe(3.0);
      expect(sentPayload.speed).toBe(1.5);
    });
  });

  describe("streaming and error handling", () => {
    it("should handle audio streaming with timing and error scenarios", async () => {
      const consoleSpy = jest.spyOn(logger, "error").mockImplementation();

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
      const consoleSpy = jest.spyOn(logger, "error").mockImplementation();

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

  describe("setPlaybackSpeed", () => {
    test("switches to the pre-generated variant and preserves logical position", async () => {
      mockState.audioContentState = {
        containerName: "container",
        baseBlobName: "test.wav",
        blobData: Buffer.alloc(32000), // 1.0x, 2s of audio
        position: 16000, // 1s into the 1.0x buffer
        playing: true,
        speed: 1.0,
        variantCache: new Map([[1.0, Buffer.alloc(32000)]]),
        baseDurationSeconds: 2.0,
      };
      mockState.currentAudioType = "audioContent";
      azureBlobService.getBlobData.mockResolvedValueOnce(Buffer.alloc(24000)); // 1.5x variant

      await websocketService.setPlaybackSpeed("test-client", 1.5);

      expect(azureBlobService.getBlobData).toHaveBeenCalledWith("container", "test__speed_1.5.wav");
      expect(mockState.audioContentState.speed).toBe(1.5);
      // logical position was 16000 bytes (1s); at 1.5x, variant-local position = 16000 / 1.5
      expect(mockState.audioContentState.position).toBeCloseTo(16000 / 1.5, -3);
      expect(mockState.audioContentState.blobData.length).toBe(24000);
    });

    test("snaps an unsupported requested speed to the nearest supported one", async () => {
      mockState.audioContentState = {
        containerName: "container",
        baseBlobName: "test.wav",
        blobData: Buffer.alloc(32000),
        position: 0,
        playing: true,
        speed: 1.0,
        variantCache: new Map([[1.0, Buffer.alloc(32000)]]),
        baseDurationSeconds: 2.0,
      };
      mockState.currentAudioType = "audioContent";
      azureBlobService.getBlobData.mockResolvedValueOnce(Buffer.alloc(20000));

      await websocketService.setPlaybackSpeed("test-client", 1.9);

      expect(azureBlobService.getBlobData).toHaveBeenCalledWith("container", "test__speed_2.0.wav");
      expect(mockState.audioContentState.speed).toBe(2.0);
    });

    test("persists speed even with no active content", async () => {
      mockState.audioContentState = null;

      await websocketService.setPlaybackSpeed("test-client", 1.5);

      expect(mockState.speed).toBe(1.5);
    });

    test("resulting variant-local position is always an even byte offset (16-bit PCM)", async () => {
      mockState.audioContentState = {
        containerName: "container",
        baseBlobName: "test.wav",
        blobData: Buffer.alloc(32000),
        position: 16001, // odd logical-equivalent position
        playing: true,
        speed: 1.0,
        variantCache: new Map([[1.0, Buffer.alloc(32000)]]),
        baseDurationSeconds: 2.0,
      };
      mockState.currentAudioType = "audioContent";
      azureBlobService.getBlobData.mockResolvedValueOnce(Buffer.alloc(24000)); // 1.5x variant

      await websocketService.setPlaybackSpeed("test-client", 1.5);

      expect(mockState.audioContentState.position % 2).toBe(0);
    });

    test.each([NaN, -1, 0])("ignores an invalid requested speed: %s", async (invalidSpeed) => {
      mockState.audioContentState = {
        containerName: "container",
        baseBlobName: "test.wav",
        blobData: Buffer.alloc(32000),
        position: 0,
        playing: true,
        speed: 1.0,
        variantCache: new Map([[1.0, Buffer.alloc(32000)]]),
        baseDurationSeconds: 2.0,
      };
      mockState.currentAudioType = "audioContent";

      await websocketService.setPlaybackSpeed("test-client", invalidSpeed);

      expect(mockState.speed).not.toBe(invalidSpeed);
      expect(azureBlobService.getBlobData).not.toHaveBeenCalled();
    });

    test("getSessionSpeed persists the last set speed independently of connection state", async () => {
      mockState.audioContentState = null;

      await websocketService.setPlaybackSpeed("test-client", 1.25);

      expect(websocketService.getSessionSpeed("test-client")).toBe(1.25);

      await websocketService.setPlaybackSpeed("test-client", 0.75);

      expect(websocketService.getSessionSpeed("test-client")).toBe(0.75);
    });

    test("getSessionSpeed defaults to 1.0 for an id that never set a speed", () => {
      expect(websocketService.getSessionSpeed("never-configured-id")).toBe(1.0);
    });
  });

  describe("mid-playback speed switch", () => {
    it("swaps to the new speed variant at the next chunk boundary with no duplicate, skipped, or restarted chunk", async () => {
      const baseData = Buffer.alloc(320 * 10, 0xaa); // 1.0x source, 10 chunks worth
      const variantData = Buffer.from(
        Array.from({ length: 320 * 10 }, (_, i) => i % 256)
      ); // 1.5x variant, byte value varies by offset so no two chunks are identical

      azureBlobService.getBlobData
        .mockResolvedValueOnce(baseData) // base blob loaded by playAudioContent
        .mockResolvedValueOnce(variantData); // 1.5x variant loaded by setPlaybackSpeed

      const sentChunks = [];
      mockWebSocket.send.mockImplementation((data, options, callback) => {
        sentChunks.push(Buffer.from(data));
        setTimeout(() => callback && callback(), 0);
      });

      await websocketService.playAudioContent(
        "test-client",
        "https://storage.example.com/container/lesson.wav"
      );

      // Let 3 chunks stream at 1.0x, leaving a 4th chunk send already scheduled
      // (in flight, not yet fired) - the loop is genuinely mid-playback.
      jest.advanceTimersByTime(45);

      expect(sentChunks).toHaveLength(3);
      expect(sentChunks[0].equals(baseData.subarray(0, 320))).toBe(true);
      expect(sentChunks[1].equals(baseData.subarray(320, 640))).toBe(true);
      expect(sentChunks[2].equals(baseData.subarray(640, 960))).toBe(true);
      expect(mockState.audioContentState.position).toBe(960);
      const playbackIdBeforeSwitch = mockState.playbackId;

      await websocketService.setPlaybackSpeed("test-client", 1.5);

      // The switch invalidates the in-flight loop (new playbackId) and swaps to
      // the 1.5x variant immediately, from the logically-equivalent position.
      expect(mockState.playbackId).toBe(playbackIdBeforeSwitch + 1);
      expect(mockState.audioContentState.blobData).toBe(variantData);
      expect(mockState.audioContentState.speed).toBe(1.5);

      const switchPosition = Math.trunc(960 / 1.5); // 640 - 1.0x logical position converted into the 1.5x variant
      expect(switchPosition % 2).toBe(0);

      // The new loop sends its first chunk synchronously - the switch takes
      // effect immediately rather than waiting a full extra 20ms cycle.
      expect(sentChunks).toHaveLength(4);
      expect(
        sentChunks[3].equals(variantData.subarray(switchPosition, switchPosition + 320))
      ).toBe(true);
      expect(mockState.audioContentState.position).toBe(switchPosition + 320);

      // Advance past the point where the OLD (pre-switch) loop's already-scheduled
      // chunk send would have fired: it must be a no-op (stale playbackId), while
      // the NEW loop continues normally with the next chunk of the variant.
      jest.advanceTimersByTime(35);

      expect(sentChunks).toHaveLength(5); // exactly one more chunk - no duplicate from the stale old loop
      expect(
        sentChunks[4].equals(
          variantData.subarray(switchPosition + 320, switchPosition + 640)
        )
      ).toBe(true);
      expect(mockState.audioContentState.position).toBe(switchPosition + 640);

      // No chunk anywhere in the stream ever came from the base (1.0x) buffer
      // after the switch, and no variant-data byte range was sent twice.
      const postSwitchChunks = sentChunks.slice(3);
      postSwitchChunks.forEach((chunk) => {
        expect(chunk.equals(baseData.subarray(0, 320))).toBe(false);
      });
      const sentRanges = postSwitchChunks.map((c) => c.toString("hex"));
      expect(new Set(sentRanges).size).toBe(sentRanges.length);
    });
  });
});
