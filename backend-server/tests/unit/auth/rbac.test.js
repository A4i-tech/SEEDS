const jwt = require("jsonwebtoken");

describe("Role-Based Access Control (RBAC) - Unit Tests", () => {
  const SECRET_KEY = process.env.SECRET_KEY || "test_secret_key_for_testing_only";

  describe("Role verification", () => {
    test("should create token with tenant role", () => {
      const token = jwt.sign({ email: "tenant@example.com", role: "tenant" }, SECRET_KEY, {
        expiresIn: "1h",
      });
      const decoded = jwt.verify(token, SECRET_KEY);

      expect(decoded.role).toBe("tenant");
      expect(decoded.email).toBe("tenant@example.com");
    });

    test("should create token with school_admin role", () => {
      const token = jwt.sign(
        { email: "admin@school.com", role: "school_admin", schoolId: "school123" },
        SECRET_KEY,
        { expiresIn: "1h" }
      );
      const decoded = jwt.verify(token, SECRET_KEY);

      expect(decoded.role).toBe("school_admin");
      expect(decoded.schoolId).toBe("school123");
    });

    test("should create token with teacher role", () => {
      const token = jwt.sign(
        { email: "teacher@school.com", role: "teacher", schoolId: "school123" },
        SECRET_KEY,
        { expiresIn: "1h" }
      );
      const decoded = jwt.verify(token, SECRET_KEY);

      expect(decoded.role).toBe("teacher");
      expect(decoded.schoolId).toBe("school123");
    });

    test("should reject invalid token", () => {
      const invalidToken = "invalid.token.here";

      expect(() => {
        jwt.verify(invalidToken, SECRET_KEY);
      }).toThrow();
    });

    test("should handle expired token", () => {
      const expiredToken = jwt.sign({ email: "user@example.com", role: "tenant" }, SECRET_KEY, {
        expiresIn: "0s",
      });

      // Wait for token to expire
      setTimeout(() => {
        expect(() => {
          jwt.verify(expiredToken, SECRET_KEY);
        }).toThrow();
      }, 100);
    });

    test("should extract role from valid token", () => {
      const roles = ["tenant", "school_admin", "teacher"];

      roles.forEach((roleType) => {
        const token = jwt.sign({ role: roleType }, SECRET_KEY);
        const decoded = jwt.verify(token, SECRET_KEY);
        expect(decoded.role).toBe(roleType);
      });
    });

    test("should preserve additional claims in token", () => {
      const claims = {
        email: "test@example.com",
        role: "teacher",
        schoolId: "school123",
        customClaim: { nested: "value" },
      };

      const token = jwt.sign(claims, SECRET_KEY);
      const decoded = jwt.verify(token, SECRET_KEY);

      expect(decoded.customClaim.nested).toBe("value");
    });
  });
});
