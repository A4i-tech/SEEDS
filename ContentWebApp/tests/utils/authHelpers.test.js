import {
  getAuthHeaders,
  isAuthenticated,
  getTokenPayload,
  setAuth,
  getRole,
  getSchoolId,
  clearAuth,
} from "../../src/utils/authHelpers";

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
  beforeEach(() => localStorage.clear());

  describe("getAuthHeaders", () => {
    it("returns headers with bearer token", () => {
      localStorage.setItem("authToken", "abc");
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
      localStorage.setItem("authToken", "abc");
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
      localStorage.setItem("authToken", makeToken({ role: "tenant", id: "t1" }));
      expect(getTokenPayload()).toMatchObject({ role: "tenant", id: "t1" });
    });
    it("returns {} for malformed token", () => {
      localStorage.setItem("authToken", "not-a-jwt");
      expect(getTokenPayload()).toEqual({});
    });
    it("returns {} when payload segment missing", () => {
      localStorage.setItem("authToken", "onlyonesegment");
      expect(getTokenPayload()).toEqual({});
    });
  });

  describe("setAuth / getRole / getSchoolId / clearAuth", () => {
    it("persists token, role, schoolId", () => {
      setAuth("tok", "school_admin", "s1");
      expect(localStorage.getItem("authToken")).toBe("tok");
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
      localStorage.setItem("authToken", "plain");
      localStorage.setItem("userRole", "teacher");
      expect(getRole()).toBe("teacher");
    });
    it("clearAuth removes everything", () => {
      setAuth("tok", "tenant", "s1");
      clearAuth();
      expect(localStorage.getItem("authToken")).toBeNull();
      expect(localStorage.getItem("userRole")).toBeNull();
      expect(localStorage.getItem("schoolId")).toBeNull();
    });
  });
});
