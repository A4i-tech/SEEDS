import { apiFetch, apiFetchBlob, apiFetchText, buildQueryString, ApiError } from "../../src/services/api";
import { setAccessToken, clearAccessToken } from "../../src/utils/tokenStore";

jest.mock("../../src/utils/authHelpers", () => ({ clearAuth: jest.fn() }));
const { clearAuth } = require("../../src/utils/authHelpers");

function fakeResponse({ ok, status = 200, json, text, contentType }) {
  return {
    ok,
    status,
    headers: { get: () => contentType },
    json: async () => json,
    text: async () => text,
  };
}

function abortError() {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

function hangUntilAborted(_url, { signal }) {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(abortError());
    signal.addEventListener("abort", () => reject(abortError()));
  });
}

describe("apiFetch", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    delete window.location;
    window.location = { pathname: "/dashboard", href: "" };
  });

  afterEach(() => {
    window.location = originalLocation;
    clearAccessToken();
  });

  it("returns parsed JSON on ok json response", async () => {
    global.fetch.mockResolvedValue(
      fakeResponse({ ok: true, contentType: "application/json", json: { a: 1 } })
    );
    await expect(apiFetch("/x")).resolves.toEqual({ a: 1 });
  });

  it("returns text on ok non-json response", async () => {
    global.fetch.mockResolvedValue(fakeResponse({ ok: true, contentType: "text/plain", text: "hi" }));
    await expect(apiFetch("/x")).resolves.toBe("hi");
  });

  it("throws ApiError on non-ok and clears auth + redirects on 401", async () => {
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 401, text: "nope" }));
    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
    expect(clearAuth).toHaveBeenCalled();
    expect(window.location.href).toBe("/");
  });

  it("does not redirect on 401 when already at root", async () => {
    window.location.pathname = "/";
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 401, text: "" }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 401 });
    expect(clearAuth).toHaveBeenCalled();
    expect(window.location.href).toBe("");
  });

  it("does not clear auth or redirect on 403 (permission failure, not an auth failure)", async () => {
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 403, text: "Access denied" }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 403, message: "Access denied" });
    expect(clearAuth).not.toHaveBeenCalled();
    expect(window.location.href).toBe("");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("still refreshes and retries on 401 when an access token is present", async () => {
    setAccessToken("expired-token");
    global.fetch
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 401, text: "expired" }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, contentType: "application/json", json: { access_token: "new-token" } }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, contentType: "application/json", json: { a: 1 } }));

    await expect(apiFetch("/x")).resolves.toEqual({ a: 1 });
    expect(clearAuth).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[2][0]).toBe("/x");
    expect(global.fetch.mock.calls[2][1].headers.Authorization).toBe("Bearer new-token");
  });

  it("does not log out when the refresh request itself fails with a network error", async () => {
    setAccessToken("expired-token");
    global.fetch
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 401, text: "expired" }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(apiFetch("/x")).rejects.toMatchObject({ message: "Failed to fetch" });
    expect(clearAuth).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("uses the backend message from a JSON error envelope", async () => {
    const body = JSON.stringify({ error: "Short", message: "Domain already registered", code: "CONFLICT", request_id: "r1" });
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 409, text: body }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 409, message: "Domain already registered" });
  });

  it("falls back to the error key, then the raw body, when message is missing", async () => {
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 400, text: JSON.stringify({ error: "Bad input" }) }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ message: "Bad input" });

    const noKeys = JSON.stringify({ detail: "x" });
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 400, text: noKeys }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ message: noKeys });
  });

  it("uses a status message when the error body is empty", async () => {
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 502, text: "" }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ message: "Request failed with status 502" });
  });

  it("aborts and reports a timeout when timeoutMs elapses", async () => {
    jest.useFakeTimers();
    global.fetch.mockImplementation(hangUntilAborted);
    const pending = expect(apiFetch("/x", { timeoutMs: 1000 })).rejects.toMatchObject({
      status: 0,
      message: "Request timed out",
    });
    jest.advanceTimersByTime(1000);
    await pending;
    jest.useRealTimers();
  });

  it("aborts after 15000ms when no timeoutMs is passed", async () => {
    jest.useFakeTimers();
    global.fetch.mockImplementation(hangUntilAborted);
    const promise = apiFetch("https://example.com/x");
    const assertion = expect(promise).rejects.toThrow("Request timed out");
    jest.advanceTimersByTime(15000);
    await assertion;
    jest.useRealTimers();
  });

  it("respects an explicit timeoutMs override", async () => {
    jest.useFakeTimers();
    global.fetch.mockImplementation(hangUntilAborted);
    const promise = apiFetch("https://example.com/x", { timeoutMs: 100 });
    const assertion = expect(promise).rejects.toThrow("Request timed out");
    jest.advanceTimersByTime(100);
    await assertion;
    jest.useRealTimers();
  });

  it("passes abort signal with default timeout when timeoutMs is not set", async () => {
    global.fetch.mockResolvedValue(fakeResponse({ ok: true, contentType: "text/plain", text: "hi" }));
    await apiFetch("/x", { method: "GET" });
    expect(global.fetch).toHaveBeenCalledWith("/x", {
      credentials: "include",
      method: "GET",
      signal: expect.any(AbortSignal),
    });
  });

  it("does not clear auth on other error statuses", async () => {
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 500, text: "boom" }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 500 });
    expect(clearAuth).not.toHaveBeenCalled();
  });

  it("wraps network errors in ApiError with status 0", async () => {
    global.fetch.mockRejectedValue(new Error("offline"));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 0, message: "offline" });
  });

  describe("caller-provided signal", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("propagates AbortError when the caller aborts before the timeout", async () => {
      jest.useFakeTimers();
      global.fetch.mockImplementation(hangUntilAborted);
      const caller = new AbortController();
      const promise = apiFetch("/x", { signal: caller.signal });
      caller.abort();
      const error = await promise.catch((e) => e);
      expect(error.name).toBe("AbortError");
      expect(error).not.toBeInstanceOf(ApiError);
      expect(global.fetch.mock.calls[0][1].signal).not.toBe(caller.signal);
    });

    it("cancels immediately when the caller signal is already aborted", async () => {
      jest.useFakeTimers();
      global.fetch.mockImplementation(hangUntilAborted);
      const caller = new AbortController();
      caller.abort();
      const error = await apiFetch("/x", { signal: caller.signal }).catch((e) => e);
      expect(error.name).toBe("AbortError");
      expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    });

    it("still times out when a caller signal is supplied but never aborted", async () => {
      jest.useFakeTimers();
      global.fetch.mockImplementation(hangUntilAborted);
      const caller = new AbortController();
      const assertion = expect(apiFetch("/x", { timeoutMs: 1000, signal: caller.signal })).rejects.toMatchObject({
        status: 0,
        message: "Request timed out",
      });
      jest.advanceTimersByTime(1000);
      await assertion;
      expect(caller.signal.aborted).toBe(false);
    });

    it("does not report a caller abort just before the deadline as a timeout", async () => {
      jest.useFakeTimers();
      global.fetch.mockImplementation(hangUntilAborted);
      const caller = new AbortController();
      const promise = apiFetch("/x", { timeoutMs: 1000, signal: caller.signal });
      jest.advanceTimersByTime(999);
      caller.abort();
      const error = await promise.catch((e) => e);
      jest.advanceTimersByTime(1000);
      expect(error.name).toBe("AbortError");
      expect(error.message).not.toBe("Request timed out");
    });

    it("removes the caller abort listener after a successful request", async () => {
      global.fetch.mockResolvedValue(fakeResponse({ ok: true, contentType: "text/plain", text: "hi" }));
      const caller = new AbortController();
      const add = jest.spyOn(caller.signal, "addEventListener");
      const remove = jest.spyOn(caller.signal, "removeEventListener");
      await apiFetch("/x", { signal: caller.signal });
      expect(add).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
      expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
    });

    it("removes the caller abort listener after failed requests", async () => {
      const caller = new AbortController();
      const add = jest.spyOn(caller.signal, "addEventListener");
      const remove = jest.spyOn(caller.signal, "removeEventListener");

      global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 500, text: "boom" }));
      await expect(apiFetch("/x", { signal: caller.signal })).rejects.toMatchObject({ status: 500, message: "boom" });
      global.fetch.mockRejectedValue(new Error("offline"));
      await expect(apiFetch("/x", { signal: caller.signal })).rejects.toMatchObject({ status: 0, message: "offline" });

      expect(remove).toHaveBeenCalledTimes(2);
      expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
      expect(remove.mock.calls[1][1]).toBe(add.mock.calls[1][1]);
    });
  });

  describe("during token refresh and retry", () => {
    const refreshed = () => fakeResponse({ ok: true, contentType: "application/json", json: { access_token: "new-token" } });

    function retryThatHangs() {
      let started;
      const retryStarted = new Promise((resolve) => {
        started = resolve;
      });
      global.fetch
        .mockResolvedValueOnce(fakeResponse({ ok: false, status: 401, text: "expired" }))
        .mockResolvedValueOnce(refreshed())
        .mockImplementationOnce((url, options) => {
          started();
          return hangUntilAborted(url, options);
        });
      return retryStarted;
    }

    beforeEach(() => {
      setAccessToken("expired-token");
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("propagates AbortError when the caller aborts the retried request", async () => {
      const retryStarted = retryThatHangs();
      const caller = new AbortController();
      const promise = apiFetch("/x", { signal: caller.signal });
      await retryStarted;
      caller.abort();

      const error = await promise.catch((e) => e);
      expect(error.name).toBe("AbortError");
      expect(error).not.toBeInstanceOf(ApiError);
      expect(global.fetch.mock.calls[2][1].signal.aborted).toBe(true);
    });

    it("reports a timeout, not a cancellation, when the retried request exceeds timeoutMs", async () => {
      jest.useFakeTimers();
      const retryStarted = retryThatHangs();
      const caller = new AbortController();
      const assertion = expect(apiFetch("/x", { timeoutMs: 1000, signal: caller.signal })).rejects.toMatchObject({
        name: "ApiError",
        status: 0,
        message: "Request timed out",
      });
      await retryStarted;
      jest.advanceTimersByTime(1000);
      await assertion;
      expect(caller.signal.aborted).toBe(false);
    });

    it("keeps a caller cancellation as AbortError when the original timeout elapsed during a slow refresh", async () => {
      jest.useFakeTimers();
      let finishRefresh;
      let retryStarted;
      const refreshStarted = new Promise((startedRefresh) => {
        retryStarted = new Promise((startedRetry) => {
          global.fetch
            .mockResolvedValueOnce(fakeResponse({ ok: false, status: 401, text: "expired" }))
            .mockImplementationOnce(
              () =>
                new Promise((resolve) => {
                  finishRefresh = () => resolve(refreshed());
                  startedRefresh();
                })
            )
            .mockImplementationOnce((url, options) => {
              startedRetry();
              return hangUntilAborted(url, options);
            });
        });
      });

      const caller = new AbortController();
      const promise = apiFetch("/x", { timeoutMs: 1000, signal: caller.signal });
      await refreshStarted;
      jest.advanceTimersByTime(5000);
      finishRefresh();
      await retryStarted;
      caller.abort();

      const error = await promise.catch((e) => e);
      expect(error.name).toBe("AbortError");
      expect(error).not.toBeInstanceOf(ApiError);
    });
  });

  it("does not abort at 14999ms and aborts at 15000ms by default", async () => {
    jest.useFakeTimers();
    global.fetch.mockImplementation(hangUntilAborted);
    let settled = false;
    const promise = apiFetch("/x").finally(() => {
      settled = true;
    });
    const assertion = expect(promise).rejects.toMatchObject({ status: 0, message: "Request timed out" });
    jest.advanceTimersByTime(14999);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    await assertion;
    jest.useRealTimers();
  });
});

describe("apiFetchText and apiFetchBlob", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("returns text and forwards headers and signal", async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => "markdown" });
    const options = { headers: { Authorization: "Bearer x" }, signal: "sig" };
    await expect(apiFetchText("/x", options)).resolves.toBe("markdown");
    expect(global.fetch).toHaveBeenCalledWith("/x", options);
  });

  it("returns a blob", async () => {
    const blob = { size: 3 };
    global.fetch.mockResolvedValue({ ok: true, status: 200, blob: async () => blob });
    await expect(apiFetchBlob("/y")).resolves.toBe(blob);
  });

  it("throws ApiError on non-ok", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, text: async () => "" });
    await expect(apiFetchText("/x")).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetchBlob("/x")).rejects.toMatchObject({ status: 404 });
  });

  it("refreshes an expired token and retries once", async () => {
    setAccessToken("expired-token");
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "expired" })
      .mockResolvedValueOnce(fakeResponse({ ok: true, contentType: "application/json", json: { access_token: "new-token" } }))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "markdown" });

    await expect(apiFetchText("/x", { headers: { Authorization: "Bearer expired-token" } })).resolves.toBe("markdown");
    expect(clearAuth).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[2][1].headers.Authorization).toBe("Bearer new-token");
  });

  it("coalesces two concurrent 401s into a single refresh request", async () => {
    setAccessToken("expired-token");
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "expired" })
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "expired" })
      .mockResolvedValueOnce(fakeResponse({ ok: true, contentType: "application/json", json: { access_token: "new-token" } }))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "markdown-a" })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "markdown-b" });

    const requestA = apiFetchText("/a", { headers: { Authorization: "Bearer expired-token" } });
    const requestB = apiFetchText("/b", { headers: { Authorization: "Bearer expired-token" } });

    await expect(requestA).resolves.toBe("markdown-a");
    await expect(requestB).resolves.toBe("markdown-b");
    expect(clearAuth).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(5);
    expect(global.fetch.mock.calls.filter(([url]) => url.endsWith("/auth/token/refresh"))).toHaveLength(1);
    expect(global.fetch.mock.calls[3][1].headers.Authorization).toBe("Bearer new-token");
    expect(global.fetch.mock.calls[4][1].headers.Authorization).toBe("Bearer new-token");
  });

  it("clears auth and does not loop when the retried request is still unauthorized", async () => {
    setAccessToken("expired-token");
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "expired" })
      .mockResolvedValueOnce(fakeResponse({ ok: true, contentType: "application/json", json: { access_token: "new-token" } }))
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "still unauthorized" });

    await expect(apiFetchText("/x")).rejects.toMatchObject({ status: 401 });
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("does not log out when the refresh request itself fails with a network error", async () => {
    setAccessToken("expired-token");
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "expired" })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(apiFetchText("/x")).rejects.toMatchObject({ message: "Failed to fetch" });
    expect(clearAuth).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("buildQueryString", () => {
  test("serializes scalar values", () => {
    expect(buildQueryString({ limit: 10, cursor: "abc" })).toBe("limit=10&cursor=abc");
  });

  test("serializes array values as repeated query params", () => {
    expect(buildQueryString({ ids: ["one", "two"], limit: 2 })).toBe("ids=one&ids=two&limit=2");
  });

  test("skips null and undefined array items", () => {
    expect(buildQueryString({ ids: ["one", null, undefined, "two"] })).toBe("ids=one&ids=two");
  });
});
