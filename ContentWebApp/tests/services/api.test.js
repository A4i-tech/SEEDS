import { apiFetch, apiFetchBlob, apiFetchText, buildQueryString, ApiError } from "../../src/services/api";

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

  it("does not clear auth or redirect on 403 and lets the error reach the caller", async () => {
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 403, text: "Access denied" }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 403, message: "Access denied" });
    expect(clearAuth).not.toHaveBeenCalled();
    expect(window.location.href).toBe("");
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
    global.fetch.mockImplementation(
      (_url, { signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
        )
    );
    const pending = expect(apiFetch("/x", { timeoutMs: 1000 })).rejects.toMatchObject({
      status: 0,
      message: "Request timed out",
    });
    jest.advanceTimersByTime(1000);
    await pending;
    jest.useRealTimers();
  });

  it("passes no abort signal when timeoutMs is not set", async () => {
    global.fetch.mockResolvedValue(fakeResponse({ ok: true, contentType: "text/plain", text: "hi" }));
    await apiFetch("/x", { method: "GET" });
    expect(global.fetch).toHaveBeenCalledWith("/x", { method: "GET" });
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
