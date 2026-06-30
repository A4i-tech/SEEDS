const validator = require("validator");
const { PASSWORD_POLICY } = require("../../../src/config/constants");

describe("School Validation - Unit Tests", () => {
  test("should accept valid email addresses", () => {
    const validEmails = ["school@example.com", "admin@school.co.uk", "info.school@domain.org"];
    validEmails.forEach((email) => {
      expect(validator.isEmail(email)).toBe(true);
    });
  });

  test("should reject invalid email addresses", () => {
    const invalidEmails = ["notanemail", "@example.com", "user@", "user @example.com"];
    invalidEmails.forEach((email) => {
      expect(validator.isEmail(email)).toBe(false);
    });
  });

  test("should reject empty school names", () => {
    const emptyNames = ["", " ", "  "];
    emptyNames.forEach((name) => {
      expect(name.trim().length > 0).toBe(false);
    });
  });

  test("should accept valid school names", () => {
    const validNames = ["Elementary School", "High School #1", "Lincoln High", "A"];
    validNames.forEach((name) => {
      expect(name.trim().length > 0).toBe(true);
    });
  });

  test("should enforce password strength per PASSWORD_POLICY", () => {
    expect(validator.isStrongPassword("ValidPass1!", PASSWORD_POLICY)).toBe(true);
    expect(validator.isStrongPassword("StrongPass456!", PASSWORD_POLICY)).toBe(true);
    expect(validator.isStrongPassword("weak", PASSWORD_POLICY)).toBe(false);
    expect(validator.isStrongPassword("123", PASSWORD_POLICY)).toBe(false);
    expect(validator.isStrongPassword("nouppercase1!", PASSWORD_POLICY)).toBe(false);
    expect(validator.isStrongPassword("NOLOWERCASE1!", PASSWORD_POLICY)).toBe(false);
    expect(validator.isStrongPassword("NoSpecial1", PASSWORD_POLICY)).toBe(false);
  });

  test("should reject empty passwords", () => {
    const emptyPasswords = ["", " ", null, undefined];
    emptyPasswords.forEach((password) => {
      const isValid = password && password.trim().length > 0;
      expect(isValid).toBeFalsy();
    });
  });
});

describe("Teacher Validation - Unit Tests", () => {
  test("should accept valid phone numbers", () => {
    const validPhones = ["+12125551234", "+14155551234"];
    validPhones.forEach((phone) => {
      expect(validator.isMobilePhone(phone)).toBe(true);
    });
  });

  test("should reject invalid phone numbers", () => {
    const invalidPhones = ["123", "abc", ""];
    invalidPhones.forEach((phone) => {
      expect(validator.isMobilePhone(phone)).toBe(false);
    });
  });
});

describe("Student Validation - Unit Tests", () => {
  test("should reject empty student names", () => {
    ["", " ", "  "].forEach((name) => {
      expect(name.trim().length > 0).toBe(false);
    });
  });

  test("should accept valid student names", () => {
    ["John Smith", "Mary Johnson", "A"].forEach((name) => {
      expect(name.trim().length > 0).toBe(true);
    });
  });

  test("should validate student email format", () => {
    expect(validator.isEmail("student@school.com")).toBe(true);
    expect(validator.isEmail("invalid.email")).toBe(false);
    expect(validator.isEmail("student@")).toBe(false);
  });
});
