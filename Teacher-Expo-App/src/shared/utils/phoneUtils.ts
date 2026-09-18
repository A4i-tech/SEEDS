export const PHONE_DIGITS_LENGTH = 10;

export function sanitizePhoneInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, PHONE_DIGITS_LENGTH);
}

export function isValidPhoneNumber(phoneNumber: string): boolean {
  return phoneNumber.replace(/\D/g, '').length === PHONE_DIGITS_LENGTH;
}

export function normalizePhoneNumber(phoneNumber: string): string {
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  const cleaned = digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;

  return cleaned.length === PHONE_DIGITS_LENGTH ? `91${cleaned}` : '';
}

export function formatStudentPhones(students: { phoneNumber: string }[]): string[] {
  return students.map((student) => normalizePhoneNumber(student.phoneNumber));
}
