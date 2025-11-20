const controlService = require("../../src/services/controlService");
const websocketService = require("../../src/services/websocketService");
const connectionManager = require("../../src/services/connectionManager");
const { MessageType } = require("../../src/constants");

jest.mock("../../src/services/websocketService");
jest.mock("../../src/services/connectionManager");

describe("ControlService", () => {
  let mockWebSocket, mockMessageHandler, mockCloseHandler, mockErrorHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebSocket = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1,
    };
    mockWebSocket.on.mockImplementation((event, handler) => {
      if (event === "message") mockMessageHandler = handler;
      if (event === "close") mockCloseHandler = handler;
      if (event === "error") mockErrorHandler = handler;
    });
    websocketService.playSystemAudioContent.mockResolvedValue();
    websocketService.playAudioContent.mockResolvedValue();
    websocketService.pauseAudioContent.mockReturnValue();
    websocketService.resumeAudioContent.mockReturnValue();
    websocketService.stopAudioContent.mockReturnValue();
    websocketService.seekAudioContent.mockResolvedValue();
    websocketService.closeConnection.mockReturnValue();
    connectionManager.removeConnection.mockReturnValue();
  });

  describe("connection handling", () => {
    it("should setup event listeners and handle close/error events", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      const errorSpy = jest.spyOn(console, "error").mockImplementation();

      controlService.handleControlConnection(mockWebSocket);
      expect(mockWebSocket.on).toHaveBeenCalledWith(
        "message",
        expect.any(Function)
      );
      expect(mockWebSocket.on).toHaveBeenCalledWith(
        "close",
        expect.any(Function)
      );
      expect(mockWebSocket.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function)
      );

      // Test close event
      mockCloseHandler();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Control WebSocket connection closed."
      );
      expect(connectionManager.removeConnection).toHaveBeenCalledWith(
        "confv2server"
      );

      // Test error event
      const testError = new Error("Test error");
      mockErrorHandler(testError);
      expect(errorSpy).toHaveBeenCalledWith(
        "Control WebSocket error:",
        testError
      );

      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("should handle all message types correctly", async () => {
      controlService.handleControlConnection(mockWebSocket);
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      const logSpy = jest.spyOn(console, "log").mockImplementation();

      // Test message types with URL parameter
      const urlTests = [
        {
          type: MessageType.PLAY_SYSTEM_MESSAGE,
          id: "client-1",
          msg: "https://example.com/system.wav",
          method: "playSystemAudioContent",
        },
        {
          type: MessageType.PLAY_AUDIO,
          id: "client-2",
          msg: "https://example.com/audio.wav",
          method: "playAudioContent",
        },
      ];

      for (const test of urlTests) {
        await mockMessageHandler(
          JSON.stringify({
            websocket_id: test.id,
            type: test.type,
            message: test.msg,
          })
        );
        expect(websocketService[test.method]).toHaveBeenCalledWith(
          test.id,
          test.msg
        );
      }

      const seekPayload = { deltaSeconds: 15 };
      await mockMessageHandler(
        JSON.stringify({
          websocket_id: "client-seek",
          type: MessageType.SEEK_AUDIO,
          message: seekPayload,
        })
      );
      expect(websocketService.seekAudioContent).toHaveBeenCalledWith(
        "client-seek",
        seekPayload
      );

      // Test message types with single parameter
      const singleParamTests = [
        {
          type: MessageType.PAUSE_AUDIO,
          id: "client-3",
          method: "pauseAudioContent",
        },
        {
          type: MessageType.RESUME_AUDIO,
          id: "client-4",
          method: "resumeAudioContent",
        },
        {
          type: MessageType.STOP_AUDIO,
          id: "client-5",
          method: "stopAudioContent",
        },
        {
          type: MessageType.DISCONNECT,
          id: "client-6",
          method: "closeConnection",
        },
      ];

      for (const test of singleParamTests) {
        await mockMessageHandler(
          JSON.stringify({
            websocket_id: test.id,
            type: test.type,
            message: "",
          })
        );
        expect(websocketService[test.method]).toHaveBeenCalledWith(test.id);
      }

      // Test heartbeat
      await mockMessageHandler(
        JSON.stringify({
          websocket_id: "client-7",
          type: MessageType.HEARTBEAT,
          message: "",
        })
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Heartbeat message received from conf server"
      );

      // Test unknown type
      await mockMessageHandler(
        JSON.stringify({
          websocket_id: "client-8",
          type: "UNKNOWN",
          message: "test",
        })
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Unknown control message type: UNKNOWN"
      );

      consoleSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("should handle errors and edge cases", async () => {
      controlService.handleControlConnection(mockWebSocket);
      const errorSpy = jest.spyOn(console, "error").mockImplementation();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      // Malformed JSON
      await mockMessageHandler("{ invalid json }");
      expect(errorSpy).toHaveBeenCalledWith(
        "Error parsing control message:",
        expect.any(Error)
      );

      // Empty/null messages
      await mockMessageHandler("");
      await mockMessageHandler(null);
      expect(errorSpy).toHaveBeenCalledTimes(3);

      // Service errors
      const testError = new Error("Service error");
      websocketService.playAudioContent.mockRejectedValue(testError);
      await mockMessageHandler(
        JSON.stringify({
          websocket_id: "error-client",
          type: MessageType.PLAY_AUDIO,
          message: "test",
        })
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "Error playing audio for ID error-client:",
        testError
      );

      websocketService.playSystemAudioContent.mockRejectedValue(testError);
      await mockMessageHandler(
        JSON.stringify({
          websocket_id: "system-error",
          type: MessageType.PLAY_SYSTEM_MESSAGE,
          message: "test",
        })
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "Error playing audio for ID system-error:",
        testError
      );

      websocketService.seekAudioContent.mockRejectedValue(testError);
      await mockMessageHandler(
        JSON.stringify({
          websocket_id: "seek-error",
          type: MessageType.SEEK_AUDIO,
          message: { deltaSeconds: 5 },
        })
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "Error seeking audio for ID seek-error:",
        testError
      );

      // Missing fields
      await mockMessageHandler(
        JSON.stringify({ type: MessageType.PLAY_AUDIO, message: "test" })
      );
      await mockMessageHandler(
        JSON.stringify({ websocket_id: "test", message: "test" })
      );
      await mockMessageHandler(
        JSON.stringify({ websocket_id: "test", type: MessageType.PLAY_AUDIO })
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "Unknown control message type: undefined"
      );

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
