// user.dto.js — request and response shapes for user/teacher/student endpoints

// ---------------------------------------------------------------------------
// Response typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} UserPublicResponse
 * @property {string} id
 * @property {string} role
 * @property {string} name
 * @property {string} email
 * @property {string} phone_number
 * @property {string} tenant_id
 * @property {string} school_id
 * @property {string} tenant_name
 * @property {string} organisation
 * @property {string} language_preference
 * @property {boolean} is_active
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} TeacherTransferResponse
 * @property {string} message
 * @property {UserPublicResponse} teacher
 */

// ---------------------------------------------------------------------------
// Request typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} StudentCreateRequest
 * @property {string} name
 * @property {string} phone_number
 */

/**
 * @typedef {Object} StudentUpdateRequest
 * @property {string} [name]
 * @property {string} [phone_number]
 */

/**
 * @typedef {Object} TeacherUpdateRequest
 * @property {string} [name]
 * @property {string} [phone_number]
 * @property {string} [password]
 */

/**
 * @typedef {Object} TeacherRegisterRequest
 * @property {string} phone_number
 * @property {string} name
 * @property {string} password
 * @property {string} school_id
 */

// ---------------------------------------------------------------------------
// Parse factories
// ---------------------------------------------------------------------------

/**
 * @param {unknown} raw
 * @returns {UserPublicResponse}
 */
export function parseUserPublicResponse(raw) {
  if (!raw.id) throw new Error("UserPublicResponse: missing id");
  return {
    id: raw.id,
    role: raw.role,
    name: raw.name,
    email: raw.email,
    phone_number: raw.phone_number,
    tenant_id: raw.tenant_id,
    school_id: raw.school_id,
    tenant_name: raw.tenant_name,
    organisation: raw.organisation,
    language_preference: raw.language_preference,
    is_active: raw.is_active,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/**
 * @param {unknown} raw
 * @returns {TeacherTransferResponse}
 */
export function parseTeacherTransferResponse(raw) {
  if (!raw.message) throw new Error("TeacherTransferResponse: missing message");
  if (!raw.teacher) throw new Error("TeacherTransferResponse: missing teacher");
  return {
    message: raw.message,
    teacher: parseUserPublicResponse(raw.teacher),
  };
}

/**
 * Build a StudentCreateRequest body
 * @param {string} name
 * @param {string} phone_number
 * @returns {StudentCreateRequest}
 */
export function buildStudentCreateRequest(name, phone_number) {
  if (!name) throw new Error("StudentCreateRequest: name is required");
  if (!phone_number) throw new Error("StudentCreateRequest: phone_number is required");
  return { name, phone_number };
}

/**
 * Build a StudentUpdateRequest body
 * @param {string} [name]
 * @param {string} [phone_number]
 * @returns {StudentUpdateRequest}
 */
export function buildStudentUpdateRequest(name, phone_number) {
  const req = {};
  if (name !== undefined && name !== null) req.name = name;
  if (phone_number !== undefined && phone_number !== null) req.phone_number = phone_number;
  return req;
}

/**
 * Build a TeacherUpdateRequest body
 * @param {string} [name]
 * @param {string} [phone_number]
 * @param {string} [password]
 * @returns {TeacherUpdateRequest}
 */
export function buildTeacherUpdateRequest(name, phone_number, password) {
  const req = {};
  if (name !== undefined && name !== null) req.name = name;
  if (phone_number !== undefined && phone_number !== null) req.phone_number = phone_number;
  if (password) req.password = password;
  return req;
}

/**
 * Build a TeacherRegisterRequest body
 * @param {string} phone_number
 * @param {string} name
 * @param {string} password
 * @param {string} school_id
 * @returns {TeacherRegisterRequest}
 */
export function buildTeacherRegisterRequest(phone_number, name, password, school_id) {
  if (!phone_number) throw new Error("TeacherRegisterRequest: phone_number is required");
  if (!name) throw new Error("TeacherRegisterRequest: name is required");
  if (!password) throw new Error("TeacherRegisterRequest: password is required");
  if (!school_id) throw new Error("TeacherRegisterRequest: school_id is required");
  return { phone_number, name, password, school_id };
}
