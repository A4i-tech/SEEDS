/**
 * Normalizes a phone number to the format expected by the conference API
 * Ensures the number is in format: 91XXXXXXXXXX (12 digits total)
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
