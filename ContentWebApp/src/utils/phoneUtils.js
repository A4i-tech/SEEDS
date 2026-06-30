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
 * @returns {string} - 10-digit phone number or empty string if invalid
 */
export const normalizePhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") return "";
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length === PHONE_DIGITS_LENGTH) return digits;
  return "";
};

/**
 * Formats array of student objects to array of phone numbers.
 * @param {Array<{phoneNumber: string}>} students - Array of student objects
 * @returns {Array<string>} - Array of normalized 10-digit phone numbers
 */
export const formatStudentPhones = (students) => {
  if (!Array.isArray(students)) return [];
  return students
    .map((s) => (s?.phoneNumber ? normalizePhoneNumber(s.phoneNumber) : null))
    .filter(Boolean);
};
