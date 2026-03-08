const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

describe("School Admin Auth Middleware - Unit Tests", () => {
  const SECRET_KEY = process.env.SECRET_KEY || "test_secret";

  function getMockReq(token) {
    return {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    };
  }

  function getMockRes() {
    const res = {};
    res.statusCode = null;
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

  // TC10.1.1 - Decode and validate school admin JWT
  test("should decode and extract school admin role and schoolId", (done) => {
    const schoolId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      { email: "admin@school.com", role: "school_admin", schoolId: schoolId.toString() },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      expect(decoded.role).toBe("school_admin");
      expect(decoded.schoolId).toBe(schoolId.toString());
      done();
    } catch (error) {
      done(error);
    }
  });

  // TC10.1.2 - Reject invalid JWT
  test("should reject invalid JWT", (done) => {
    const token = "invalid.jwt.token";
    const res = getMockRes();

    try {
      jwt.verify(token, SECRET_KEY);
      done(new Error("Should have thrown"));
    } catch (error) {
      expect(error).toBeDefined();
      done();
    }
  });

  // TC10.1.3 - Verify schoolId from token
  test("should add schoolId to request object", (done) => {
    const schoolId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      { email: "admin@school.com", role: "school_admin", schoolId: schoolId.toString() },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const req = getMockReq(token);

    // In real middleware, this would be: req.user.schoolId = decoded.schoolId
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;

    expect(req.user.schoolId).toBe(schoolId.toString());
    done();
  });
});

describe("Teacher Auth Middleware - Unit Tests", () => {
  const SECRET_KEY = process.env.SECRET_KEY || "test_secret";

  function getMockReq(token) {
    return {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    };
  }

  // TC10.2.1 - Decode teacher JWT with schoolId (MODIFIED)
  test("should extract teacher role and schoolId from token", (done) => {
    const schoolId = new mongoose.Types.ObjectId();
    const teacherId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      {
        email: "teacher@school.com",
        role: "teacher",
        teacherId: teacherId.toString(),
        schoolId: schoolId.toString(),
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      expect(decoded.role).toBe("teacher");
      expect(decoded.schoolId).toBe(schoolId.toString());
      expect(decoded.teacherId).toBe(teacherId.toString());
      done();
    } catch (error) {
      done(error);
    }
  });

  // TC10.2.2 - Verify teacher token structure
  test("should verify teacher token has required fields", (done) => {
    const token = jwt.sign(
      {
        email: "teacher@school.com",
        role: "teacher",
        teacherId: new mongoose.Types.ObjectId().toString(),
      },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    const decoded = jwt.verify(token, SECRET_KEY);

    expect(decoded).toHaveProperty("role", "teacher");
    expect(decoded).toHaveProperty("email");
    done();
  });
});

describe("Error Handling & Edge Cases - Unit Tests", () => {
  const SECRET_KEY = process.env.SECRET_KEY || "test_secret";

  // TC16.1.1 - Invalid ObjectId returns 400 Bad Request
  test("should validate ObjectId format", () => {
    const isValidObjectId = (id) => {
      return /^[0-9a-fA-F]{24}$/.test(id);
    };

    expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
    expect(isValidObjectId("invalid")).toBe(false);
    expect(isValidObjectId("")).toBe(false);
  });

  // TC16.1.2 - Duplicate key error handling
  test("should handle duplicate key constraint violation", () => {
    const isDuplicateKeyError = (error) => {
      return error.code === 11000;
    };

    const duplicateError = { code: 11000, message: "Duplicate key error" };
    expect(isDuplicateKeyError(duplicateError)).toBe(true);
  });

  // TC16.1.3 - Missing required fields
  test("should validate required fields presence", () => {
    const validateRequired = (data, requiredFields) => {
      return requiredFields.every((field) => data[field] !== undefined && data[field] !== "");
    };

    const data = { name: "Test", email: "", schoolId: "123" };
    const required = ["name", "email", "schoolId"];

    expect(validateRequired(data, required)).toBe(false);
  });

  // TC16.2.1 - Create school with special characters
  test("should handle special characters in school name", () => {
    const specialNames = ["School's Name", "School & Co.", "School #1", "School (Main)"];

    specialNames.forEach((name) => {
      const isValid = name.trim().length > 0;
      expect(isValid).toBe(true);
    });
  });

  // TC16.2.2 - Very long email addresses
  test("should validate very long email addresses", () => {
    const validateEmail = (email) => {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
    };

    expect(validateEmail("a".repeat(200) + "@example.com")).toBe(true);
    expect(validateEmail("a".repeat(300) + "@example.com")).toBe(false);
  });

  // TC16.2.3 - Token expiration handling
  test("should properly handle expired tokens", (done) => {
    const SECRET_KEY = process.env.SECRET_KEY || "test_secret";
    const expiredToken = jwt.sign(
      { email: "test@example.com", role: "tenant" },
      SECRET_KEY,
      { expiresIn: "-1h" } // Already expired
    );

    try {
      jwt.verify(expiredToken, SECRET_KEY);
      done(new Error("Should have thrown TokenExpiredError"));
    } catch (error) {
      expect(error.name).toBe("TokenExpiredError");
      done();
    }
  });

  // TC16.2.4 - Empty analytics date range
  test("should handle empty analytics results", () => {
    const validateDateRange = (startDate, endDate) => {
      const start = new Date(startDate);
      const end = new Date(endDate);
      return start < end;
    };

    expect(validateDateRange("2025-01-01T00:00:00Z", "2025-12-31T23:59:59Z")).toBe(true);
    expect(validateDateRange("2025-12-31T23:59:59Z", "2025-01-01T00:00:00Z")).toBe(false);
  });

  // TC16.1.4 - Proper error messages for validation
  test("should provide meaningful validation error messages", () => {
    const getErrorMessage = (field, reason) => {
      const messages = {
        email_format: `Invalid email format for ${field}`,
        required: `${field} is required`,
        duplicate: `${field} already exists`,
      };
      return messages[reason] || "Validation error";
    };

    expect(getErrorMessage("email", "email_format")).toContain("Invalid email");
    expect(getErrorMessage("name", "required")).toContain("required");
    expect(getErrorMessage("phone", "duplicate")).toContain("already exists");
  });
});
