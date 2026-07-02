import { apiFetch, buildQueryString, ApiError } from "../../src/services/api";

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
    global.fetch.mockResolvedValue(fakeResponse({ ok: false, status: 403, text: "" }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 403 });
    expect(clearAuth).toHaveBeenCalled();
    expect(window.location.href).toBe("");
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
