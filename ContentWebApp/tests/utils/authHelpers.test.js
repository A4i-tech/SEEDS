import {
  getAuthHeaders,
  isAuthenticated,
  getTokenPayload,
  setAuth,
  getRole,
  getSchoolId,
  clearAuth,
} from "../../src/utils/authHelpers";
import { getAccessToken, setAccessToken, clearAccessToken } from "../../src/utils/tokenStore";

// base64url-encode a JSON payload into a fake JWT (header.payload.signature).
function makeToken(payload) {
  const b64 = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${b64}.sig`;
}

describe("authHelpers", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAccessToken();
  });

  describe("getAuthHeaders", () => {
    it("returns headers with bearer token", () => {
      setAccessToken("abc");
      expect(getAuthHeaders()).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer abc",
      });
    });
    it("throws when no token", () => {
      expect(() => getAuthHeaders()).toThrow(/no auth token/i);
    });
  });

  describe("isAuthenticated", () => {
    it("true when token present", () => {
      setAccessToken("abc");
      expect(isAuthenticated()).toBe(true);
    });
    it("false when absent", () => {
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe("getTokenPayload", () => {
    it("returns {} when no token", () => {
      expect(getTokenPayload()).toEqual({});
    });
    it("decodes a valid token", () => {
      setAccessToken(makeToken({ role: "tenant", id: "t1" }));
      expect(getTokenPayload()).toMatchObject({ role: "tenant", id: "t1" });
    });
    it("returns {} for malformed token", () => {
      setAccessToken("not-a-jwt");
      expect(getTokenPayload()).toEqual({});
    });
    it("returns {} when payload segment missing", () => {
      setAccessToken("onlyonesegment");
      expect(getTokenPayload()).toEqual({});
    });
  });

  describe("setAuth / getRole / getSchoolId / clearAuth", () => {
    it("persists token, role, schoolId", () => {
      setAuth("tok", "school_admin", "s1");
      expect(getAccessToken()).toBe("tok");
      expect(localStorage.getItem("userRole")).toBe("school_admin");
      expect(getSchoolId()).toBe("s1");
    });
    it("omits schoolId when not provided", () => {
      setAuth("tok", "tenant");
      expect(getSchoolId()).toBeNull();
    });
    it("clears a stale schoolId on re-login without one", () => {
      localStorage.setItem("schoolId", "old");
      setAuth("tok", "tenant");
      expect(getSchoolId()).toBeNull();
    });
    it("getRole prefers token payload role", () => {
      setAuth(makeToken({ role: "content_creator" }), "tenant");
      expect(getRole()).toBe("content_creator");
    });
    it("getRole falls back to issuer then stored role", () => {
      setAuth(makeToken({ iss: "school_admin" }), "tenant");
      expect(getRole()).toBe("school_admin");
      setAccessToken("plain");
      localStorage.setItem("userRole", "teacher");
      expect(getRole()).toBe("teacher");
    });
    it("clearAuth removes everything", () => {
      setAuth("tok", "tenant", "s1");
      clearAuth();
      expect(getAccessToken()).toBeNull();
      expect(localStorage.getItem("userRole")).toBeNull();
      expect(localStorage.getItem("schoolId")).toBeNull();
    });
  });
});
