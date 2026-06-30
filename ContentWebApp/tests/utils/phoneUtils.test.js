import {
  PHONE_DIGITS_LENGTH,
  sanitizePhoneInput,
  isValidPhoneNumber,
} from "../../src/utils/phoneUtils";

describe("phoneUtils", () => {
  test("PHONE_DIGITS_LENGTH is 10", () => {
    expect(PHONE_DIGITS_LENGTH).toBe(10);
  });

  describe("sanitizePhoneInput", () => {
    test("strips non-digits and limits to 10", () => {
      expect(sanitizePhoneInput("12a34b56")).toBe("123456");
      expect(sanitizePhoneInput("12345678901234")).toBe("1234567890");
      expect(sanitizePhoneInput("+91 1234567890")).toBe("9112345678");
    });

    test("returns empty for null or non-string", () => {
      expect(sanitizePhoneInput(null)).toBe("");
      expect(sanitizePhoneInput(undefined)).toBe("");
    });

    test("handles whitespace and special characters", () => {
      expect(sanitizePhoneInput("123 456 7890")).toBe("1234567890");
      expect(sanitizePhoneInput("(123) 456-7890")).toBe("1234567890");
    });

    test("returns empty for empty string", () => {
      expect(sanitizePhoneInput("")).toBe("");
    });
  });

  describe("isValidPhoneNumber", () => {
    test("returns true for valid 10-digit phone numbers", () => {
      expect(isValidPhoneNumber("1234567890")).toBe(true);
      expect(isValidPhoneNumber("9876543210")).toBe(true);
    });

    test("returns false for invalid phone numbers", () => {
      expect(isValidPhoneNumber("")).toBe(false);
      expect(isValidPhoneNumber("123")).toBe(false);
      expect(isValidPhoneNumber("12345678901")).toBe(false);
      expect(isValidPhoneNumber("abc")).toBe(false);
    });

    test("returns true after sanitization of valid input", () => {
      expect(isValidPhoneNumber("123-456-7890")).toBe(true);
      expect(isValidPhoneNumber("(123) 456 7890")).toBe(true);
    });
  });
});
