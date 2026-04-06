const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { authenticateToken, authorizeRole } = require("../../../src/auth/authenticateToken");

const SECRET_KEY = process.env.SECRET_KEY;

function getMockReq(token) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

function getMockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.sendStatus = function (code) {
    this.statusCode = code;
    return this;
  };
  res.json = function (obj) {
    this.body = obj;
    return this;
  };
  return res;
}

describe("authenticateToken middleware - School Admin", () => {
  test("should set req.user with school_admin role and schoolId for valid token", (done) => {
    const schoolId = new mongoose.Types.ObjectId().toString();
    const token = jwt.sign(
      { id: schoolId, email: "admin@school.com", role: "school_admin", schoolId, tenantId: "t1", iss: "school_admin" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq(token);
    const res = getMockRes();

    authenticateToken(req, res, () => {
      try {
        expect(req.user.role).toBe("school_admin");
        expect(req.user.schoolId).toBe(schoolId);
        expect(req.role).toBe("school_admin");
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  test("should return 401 when no token is provided", () => {
    const req = getMockReq();
    const res = getMockRes();
    let nextCalled = false;

    authenticateToken(req, res, () => { nextCalled = true; });

    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  test("should return 403 for an invalid JWT", (done) => {
    const req = getMockReq("invalid.jwt.token");
    const res = getMockRes();

    authenticateToken(req, res, () => {
      done(new Error("next() should not be called for invalid token"));
    });

    // jwt.verify is async with callback, give it a tick
    setTimeout(() => {
      try {
        expect(res.statusCode).toBe(403);
        done();
      } catch (e) {
        done(e);
      }
    }, 50);
  });
});

describe("authenticateToken middleware - Teacher", () => {
  test("should set req.user with teacher role and schoolId for valid token", (done) => {
    const schoolId = new mongoose.Types.ObjectId().toString();
    const teacherId = new mongoose.Types.ObjectId().toString();
    const token = jwt.sign(
      { email: "teacher@school.com", role: "teacher", teacherId, schoolId, tenantId: "t1" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq(token);
    const res = getMockRes();

    authenticateToken(req, res, () => {
      try {
        expect(req.user.role).toBe("teacher");
        expect(req.user.schoolId).toBe(schoolId);
        expect(req.user.teacherId).toBe(teacherId);
        expect(req.role).toBe("teacher");
        expect(req.schoolId).toBe(schoolId);
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});

describe("authenticateToken middleware - Edge Cases", () => {
  test("should return 403 for expired token", (done) => {
    const token = jwt.sign(
      { email: "test@example.com", role: "tenant" },
      SECRET_KEY,
      { expiresIn: "-1h" }
    );

    const req = getMockReq(token);
    const res = getMockRes();

    authenticateToken(req, res, () => {
      done(new Error("next() should not be called for expired token"));
    });

    setTimeout(() => {
      try {
        expect(res.statusCode).toBe(403);
        done();
      } catch (e) {
        done(e);
      }
    }, 50);
  });

  test("should return 403 for token signed with wrong secret", (done) => {
    const token = jwt.sign(
      { email: "test@example.com", role: "tenant" },
      "wrong-secret",
      { expiresIn: "1h" }
    );

    const req = getMockReq(token);
    const res = getMockRes();

    authenticateToken(req, res, () => {
      done(new Error("next() should not be called for wrong secret"));
    });

    setTimeout(() => {
      try {
        expect(res.statusCode).toBe(403);
        done();
      } catch (e) {
        done(e);
      }
    }, 50);
  });

  test("should return 401 when Authorization header has no token after Bearer", () => {
    const req = { headers: { authorization: "Bearer " } };
    const res = getMockRes();
    let nextCalled = false;

    authenticateToken(req, res, () => { nextCalled = true; });

    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });
});
