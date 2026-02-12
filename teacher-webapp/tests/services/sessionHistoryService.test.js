import * as sessionHistoryService from "../../src/services/sessionHistoryService";
import * as authHelpers from "../../src/utils/authHelpers";

describe("sessionHistoryService", () => {
  const createLocalStorageMock = () => {
    const store = {};
    return {
      getItem: jest.fn((key) => store[key] || null),
      setItem: jest.fn((key, value) => {
        store[key] = value.toString();
      }),
      removeItem: jest.fn((key) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        Object.keys(store).forEach((key) => delete store[key]);
      }),
      _store: store, // Expose store for testing
    };
  };

  let localStorageMock;

  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
    jest.clearAllMocks();
    jest.spyOn(authHelpers, "isLocalStorageAvailable").mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("SessionHistoryItem", () => {
    test("creates a session history item with all properties", () => {
      const item = new sessionHistoryService.SessionHistoryItem({
        groupId: "classroom-123",
        groupName: "Math Class",
        timestamp: 1234567890,
        studentCount: 5,
        wasConference: true,
      });

      expect(item.groupId).toBe("classroom-123");
      expect(item.groupName).toBe("Math Class");
      expect(item.timestamp).toBe(1234567890);
      expect(item.studentCount).toBe(5);
      expect(item.wasConference).toBe(true);
    });

    test("defaults wasConference to true", () => {
      const item = new sessionHistoryService.SessionHistoryItem({
        groupId: "classroom-123",
        groupName: "Math Class",
        timestamp: 1234567890,
        studentCount: 5,
      });

      expect(item.wasConference).toBe(true);
    });
  });

  describe("getSessionHistory", () => {
    test("returns empty array when localStorage is not available", () => {
      jest.spyOn(authHelpers, "isLocalStorageAvailable").mockReturnValueOnce(false);
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      const result = sessionHistoryService.getSessionHistory();

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "localStorage is not available, returning empty history"
      );
      expect(localStorageMock.getItem).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    test("returns empty array when no history exists", () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = sessionHistoryService.getSessionHistory();

      expect(result).toEqual([]);
    });

    test("returns empty array when history is not an array", () => {
      localStorageMock.getItem.mockReturnValue('{"invalid": "data"}');

      const result = sessionHistoryService.getSessionHistory();

      expect(result).toEqual([]);
    });

    test("returns parsed session history items", () => {
      const historyData = [
        {
          groupId: "classroom-123",
          groupName: "Math Class",
          timestamp: 1234567890,
          studentCount: 5,
          wasConference: true,
        },
        {
          groupId: "classroom-456",
          groupName: "Science Class",
          timestamp: 1234567891,
          studentCount: 3,
          wasConference: true,
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(historyData));

      const result = sessionHistoryService.getSessionHistory();

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(sessionHistoryService.SessionHistoryItem);
      expect(result[0].groupId).toBe("classroom-123");
      expect(result[0].groupName).toBe("Math Class");
      expect(result[1].groupId).toBe("classroom-456");
    });

    test("handles JSON parse errors gracefully", () => {
      localStorageMock.getItem.mockReturnValue("invalid json");
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const result = sessionHistoryService.getSessionHistory();

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("addSessionToHistory", () => {
    test("does nothing when localStorage is not available", () => {
      jest.spyOn(authHelpers, "isLocalStorageAvailable").mockReturnValueOnce(false);
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      sessionHistoryService.addSessionToHistory({
        groupId: "classroom-123",
        groupName: "Math Class",
        studentCount: 5,
      });

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "localStorage is not available, cannot save session history"
      );

      consoleWarnSpy.mockRestore();
    });

    test("does nothing when groupId is missing", () => {
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      sessionHistoryService.addSessionToHistory({
        groupName: "Math Class",
        studentCount: 5,
      });

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Cannot save session to history: missing groupId or groupName",
        expect.objectContaining({ groupName: "Math Class" })
      );

      consoleWarnSpy.mockRestore();
    });

    test("does nothing when groupName is missing", () => {
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      sessionHistoryService.addSessionToHistory({
        groupId: "classroom-123",
        studentCount: 5,
      });

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    test("saves session to history", () => {
      sessionHistoryService.addSessionToHistory({
        groupId: "classroom-123",
        groupName: "Math Class",
        studentCount: 5,
      });

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].groupId).toBe("classroom-123");
      expect(savedData[0].groupName).toBe("Math Class");
      expect(savedData[0].studentCount).toBe(5);
      expect(savedData[0].wasConference).toBe(true);
    });

    test("adds new session at the top of history", () => {
      // Add first session
      sessionHistoryService.addSessionToHistory({
        groupId: "classroom-123",
        groupName: "Math Class",
        studentCount: 5,
      });

      // Verify first session was saved
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
      const firstCallData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(firstCallData).toHaveLength(1);
      expect(firstCallData[0].groupId).toBe("classroom-123");

      // Add second session - this should read the first from store
      sessionHistoryService.addSessionToHistory({
        groupId: "classroom-456",
        groupName: "Science Class",
        studentCount: 3,
      });

      // Verify second session was added at the top
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(2);
      const secondCallData = JSON.parse(localStorageMock.setItem.mock.calls[1][1]);
      expect(secondCallData).toHaveLength(2);
      expect(secondCallData[0].groupId).toBe("classroom-456"); // Most recent first
      expect(secondCallData[1].groupId).toBe("classroom-123");
    });

    test("limits history to maxSize", () => {
      // Add more than maxSize (default 5) sessions
      // Each call will read from store and write back, so state persists
      for (let i = 0; i < 15; i++) {
        sessionHistoryService.addSessionToHistory({
          groupId: `classroom-${i}`,
          groupName: `Class ${i}`,
          studentCount: i,
        });
      }

      // Verify we made 15 calls
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(15);

      // The last call should have only 5 items (maxSize)
      const lastCall =
        localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1]);
      expect(savedData).toHaveLength(5); // Limited to default maxSize

      // Verify the most recent items are kept
      expect(savedData[0].groupId).toBe("classroom-14"); // Most recent
      expect(savedData[4].groupId).toBe("classroom-10"); // Oldest kept
    });

    test("respects custom maxSize option", () => {
      for (let i = 0; i < 5; i++) {
        sessionHistoryService.addSessionToHistory(
          {
            groupId: `classroom-${i}`,
            groupName: `Class ${i}`,
            studentCount: i,
          },
          { maxSize: 3 }
        );
      }

      // Verify we made 5 calls
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(5);

      // The last call should have only 3 items (custom maxSize)
      const lastCall =
        localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1]);
      expect(savedData).toHaveLength(3);

      // Verify the most recent items are kept
      expect(savedData[0].groupId).toBe("classroom-4"); // Most recent
      expect(savedData[2].groupId).toBe("classroom-2"); // Oldest kept
    });

    test("defaults studentCount to 0 when not provided", () => {
      sessionHistoryService.addSessionToHistory({
        groupId: "classroom-123",
        groupName: "Math Class",
      });

      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(savedData[0].studentCount).toBe(0);
    });

    test("handles errors gracefully", () => {
      // First, set up valid history so getSessionHistory doesn't error
      localStorageMock._store["seeds_session_history"] = "[]";

      // Then make setItem throw
      const originalSetItem = localStorageMock.setItem;
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error("Storage quota exceeded");
      });

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      sessionHistoryService.addSessionToHistory({
        groupId: "classroom-123",
        groupName: "Math Class",
        studentCount: 5,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error saving session to history:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      localStorageMock.setItem = originalSetItem;
    });
  });

  describe("clearSessionHistory", () => {
    test("does nothing when localStorage is not available", () => {
      jest.spyOn(authHelpers, "isLocalStorageAvailable").mockReturnValueOnce(false);

      sessionHistoryService.clearSessionHistory();

      expect(localStorageMock.removeItem).not.toHaveBeenCalled();
    });

    test("removes session history from localStorage", () => {
      localStorageMock.setItem("seeds_session_history", "[]");

      sessionHistoryService.clearSessionHistory();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith("seeds_session_history");
    });

    test("handles errors gracefully", () => {
      const originalRemoveItem = localStorageMock.removeItem;
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error("Storage error");
      });
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      sessionHistoryService.clearSessionHistory();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error clearing session history:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      localStorageMock.removeItem = originalRemoveItem;
    });
  });

  describe("getMaxHistorySize", () => {
    test("returns default history size", () => {
      expect(sessionHistoryService.getMaxHistorySize()).toBe(5);
    });
  });
});
