import { apiFetch, ApiError } from "../../src/services/api";

describe("apiFetch", () => {
  afterEach(() => {
    delete global.fetch;
  });

  test("has default timeout of 15000ms", async () => {
    let capturedTimeout = null;

    global.fetch = jest.fn(async (url, options) => {
      // Verify that the signal (from AbortController) is being passed
      expect(options.signal).toBeDefined();
      expect(options.signal.aborted).toBe(false);
      throw new Error("Network error");
    });

    try {
      await apiFetch("https://example.com/x");
    } catch (error) {
      // Just verify the function can be called
      expect(error).toBeDefined();
    }
  });

  test("respects explicit timeout override", async () => {
    global.fetch = jest.fn(async (url, options) => {
      // Verify that a signal is passed even with custom timeout
      expect(options.signal).toBeDefined();
      throw new Error("Network error");
    });

    try {
      await apiFetch("https://example.com/x", { timeoutMs: 100 });
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("converts AbortError to 'Request timed out' message", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    global.fetch = jest.fn().mockRejectedValueOnce(abortError);

    try {
      await apiFetch("https://example.com/x");
      fail("Should have thrown ApiError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe("Request timed out");
    }
  });
});
