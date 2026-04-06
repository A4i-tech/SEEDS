const jwt = require("jsonwebtoken");
const { authorizeRole } = require("../../../src/auth/authenticateToken");

const SECRET_KEY = process.env.SECRET_KEY;

function getMockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.json = function (obj) {
    this.body = obj;
    return this;
  };
  return res;
}

describe("Role-Based Access Control (RBAC) - Unit Tests", () => {
  describe("authorizeRole middleware", () => {
    test("should allow tenant role when tenant is permitted", () => {
      const middleware = authorizeRole("tenant");
      const req = { user: { role: "tenant" }, role: "tenant" };
      const res = getMockRes();
      let nextCalled = false;

      middleware(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    test("should allow school_admin role when school_admin is permitted", () => {
      const middleware = authorizeRole("school_admin");
      const req = { user: { role: "school_admin" }, role: "school_admin" };
      const res = getMockRes();
      let nextCalled = false;

      middleware(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    test("should allow teacher role when teacher is permitted", () => {
      const middleware = authorizeRole("teacher");
      const req = { user: { role: "teacher" }, role: "teacher" };
      const res = getMockRes();
      let nextCalled = false;

      middleware(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    test("should reject tenant when only school_admin is permitted", () => {
      const middleware = authorizeRole("school_admin");
      const req = { user: { role: "tenant" }, role: "tenant" };
      const res = getMockRes();
      let nextCalled = false;

      middleware(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(403);
    });

    test("should reject teacher when only tenant is permitted", () => {
      const middleware = authorizeRole("tenant");
      const req = { user: { role: "teacher" }, role: "teacher" };
      const res = getMockRes();
      let nextCalled = false;

      middleware(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(403);
    });

    test("should allow when role is one of multiple permitted roles", () => {
      const middleware = authorizeRole("school_admin", "teacher");
      const req = { user: { role: "teacher" }, role: "teacher" };
      const res = getMockRes();
      let nextCalled = false;

      middleware(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    test("should return 401 when req.user is missing", () => {
      const middleware = authorizeRole("tenant");
      const req = { role: "tenant" };
      const res = getMockRes();
      let nextCalled = false;

      middleware(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(401);
    });
  });

  describe("Token expiration", () => {
    test("should reject expired token synchronously with negative expiry", () => {
      const expiredToken = jwt.sign(
        { email: "user@example.com", role: "tenant" },
        SECRET_KEY,
        { expiresIn: "-1h" }
      );

      expect(() => {
        jwt.verify(expiredToken, SECRET_KEY);
      }).toThrow();
    });
  });
});
