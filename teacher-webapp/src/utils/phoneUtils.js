/**
 * Indian mobile: digits only, 10 digits.
 * PhoneNumberInput restricts input to 10 digits.
 * Phone numbers are transmitted as-is (10 digits) to the backend.
 */

/** Expected length of user-entered Indian mobile (digits only). */
export const PHONE_DIGITS_LENGTH = 10;

/** Digits only, max 10. Used by PhoneNumberInput. */
export const sanitizePhoneInput = (value) => {
  if (value == null || typeof value !== "string") return "";
  return value.replace(/\D/g, "").slice(0, PHONE_DIGITS_LENGTH);
};

/** Validates if a phone number is exactly 10 digits (strips non-digits first). */
export const isValidPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") return false;
  const digits = phoneNumber.replace(/\D/g, "");
  return digits.length === PHONE_DIGITS_LENGTH;
};

/**
 * Normalizes phone number to 10-digit format.
 * Strips non-digits and validates length.
 * @param {string} phoneNumber - The phone number to normalize
 * @returns {string} - Normalized phone number with 91 prefix
 */
export const normalizePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) {
    return "";
  }

  // Remove all non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  // If already starts with 91, remove it to avoid double prefix
  let cleaned = digitsOnly.startsWith("91") ? digitsOnly.substring(2) : digitsOnly;

  // Ensure it's 10 digits (Indian phone number format)
  if (cleaned.length !== 10) {
    console.warn(`Phone number "${phoneNumber}" is not 10 digits after cleaning: "${cleaned}"`);
    // Return as-is if it doesn't match expected format, but log warning
    return cleaned.length > 0 ? `91${cleaned}` : "";
  }

  // Add 91 prefix
  return `91${cleaned}`;
};

/**
 * Formats phone numbers for conference creation
 * @param {Array<{phoneNumber: string}>} students - Array of student objects
 * @returns {Array<string>} - Array of normalized phone numbers
 */
export const formatStudentPhones = (students) => {
  if (!Array.isArray(students)) {
    return [];
  }

  return students
    .map((student) => {
      if (!student || !student.phoneNumber) {
        console.error("Student missing phone number:", student);
        return null;
      }
      return normalizePhoneNumber(student.phoneNumber);
    })
    .filter(Boolean); // Remove null/empty values
};
