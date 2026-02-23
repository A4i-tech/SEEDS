import * as authHelpers from "../../src/utils/authHelpers";

describe("authHelpers", () => {
  // Mock localStorage
  const localStorageMock = (() => {
    let store = {};
    return {
      getItem: jest.fn((key) => store[key] || null),
      setItem: jest.fn((key, value) => {
        store[key] = value.toString();
      }),
      removeItem: jest.fn((key) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        store = {};
      }),
    };
  })();

  beforeEach(() => {
    // Reset localStorage mock
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe("isLocalStorageAvailable", () => {
    test("returns true when localStorage is available", () => {
      expect(authHelpers.isLocalStorageAvailable()).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith("__localStorage_test__", "__localStorage_test__");
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("__localStorage_test__");
    });

    test("returns false when localStorage.setItem throws an error", () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error("QuotaExceededError");
      });

      expect(authHelpers.isLocalStorageAvailable()).toBe(false);
    });

    test("returns false when localStorage.removeItem throws an error", () => {
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error("SecurityError");
      });

      expect(authHelpers.isLocalStorageAvailable()).toBe(false);
    });

    test("returns false when localStorage is undefined", () => {
      Object.defineProperty(window, "localStorage", {
        value: undefined,
        writable: true,
      });

      expect(authHelpers.isLocalStorageAvailable()).toBe(false);
    });

    test("returns false when localStorage is null", () => {
      Object.defineProperty(window, "localStorage", {
        value: null,
        writable: true,
      });

      expect(authHelpers.isLocalStorageAvailable()).toBe(false);
    });
  });

  describe("isAuthenticated", () => {
    test("returns false when localStorage is not available", () => {
      // Clear any previous calls
      jest.clearAllMocks();

      // Simulate localStorage being unavailable
      Object.defineProperty(window, "localStorage", {
        value: undefined,
        writable: true,
      });

      const result = authHelpers.isAuthenticated();

      expect(result).toBe(false);
      // isAuthenticated should return early without calling getItem when localStorage is unavailable
      expect(localStorageMock.getItem).not.toHaveBeenCalled();
    });

    test("returns false when no token exists", () => {
      localStorageMock.getItem.mockReturnValue(null);

      expect(authHelpers.isAuthenticated()).toBe(false);
      expect(localStorageMock.getItem).toHaveBeenCalledWith("authToken");
    });

    test("returns true when token exists", () => {
      localStorageMock.getItem.mockReturnValue("test-token-123");

      expect(authHelpers.isAuthenticated()).toBe(true);
      expect(localStorageMock.getItem).toHaveBeenCalledWith("authToken");
    });

    test("returns false when token is empty string", () => {
      localStorageMock.getItem.mockReturnValue("");

      expect(authHelpers.isAuthenticated()).toBe(false);
    });
  });

  describe("clearAuth", () => {
    test("does nothing when localStorage is not available", () => {
      // Clear any previous calls
      jest.clearAllMocks();

      // Simulate localStorage being unavailable
      Object.defineProperty(window, "localStorage", {
        value: undefined,
        writable: true,
      });

      authHelpers.clearAuth();

      // clearAuth should return early without calling removeItem when localStorage is unavailable
      expect(localStorageMock.removeItem).not.toHaveBeenCalled();
    });

    test("removes authToken when localStorage is available", () => {
      localStorageMock.setItem("authToken", "test-token");

      authHelpers.clearAuth();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith("authToken");
    });

    test("handles errors gracefully when removeItem throws", () => {
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error("Storage error");
      });

      // Should not throw
      expect(() => authHelpers.clearAuth()).not.toThrow();
    });
  });

  describe("getAuthHeaders", () => {
    test("returns null when no token exists", () => {
      jest.clearAllMocks();
      localStorageMock.getItem.mockReturnValue(null);

      const result = authHelpers.getAuthHeaders();

      expect(result).toBeNull();
      // When there is no token, auth should be cleared (authToken removed)
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("authToken");
    });

    test("returns headers with token when token exists", () => {
      localStorageMock.getItem.mockReturnValue("test-token-123");

      const result = authHelpers.getAuthHeaders();

      expect(result).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer test-token-123",
      });
    });

    test("returns null and clears auth when token is empty string", () => {
      jest.clearAllMocks();
      localStorageMock.getItem.mockReturnValue("");

      const result = authHelpers.getAuthHeaders();

      expect(result).toBeNull();
      // When token is empty, auth should be cleared (authToken removed)
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("authToken");
    });
  });
});
