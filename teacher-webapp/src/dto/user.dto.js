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
 * @param {unknown} raw
 * @returns {UserPublicResponse}
 */
export function parseUserPublicResponse(raw) {
  if (!raw?.id) throw new Error("UserPublicResponse: missing id");
  if (!raw?.role) throw new Error("UserPublicResponse: missing role");
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
 * @typedef {Object} StudentCreateRequest
 * @property {string} name
 * @property {string} phone_number
 */

/**
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.phone_number
 * @returns {StudentCreateRequest}
 */
export function buildStudentCreateRequest({ name, phone_number }) {
  if (!name) throw new Error("StudentCreateRequest: missing name");
  if (!phone_number) throw new Error("StudentCreateRequest: missing phone_number");
  return { name, phone_number };
}

/**
 * @typedef {Object} StudentUpdateRequest
 * @property {string} [name]
 * @property {string} [phone_number]
 */

/**
 * @param {Object} data
 * @param {string} [data.name]
 * @param {string} [data.phone_number]
 * @returns {StudentUpdateRequest}
 */
export function buildStudentUpdateRequest({ name, phone_number }) {
  const req = {};
  if (name !== undefined) req.name = name;
  if (phone_number !== undefined) req.phone_number = phone_number;
  return req;
}

/**
 * @typedef {Object} TeacherUpdateRequest
 * @property {string} [name]
 * @property {string} [phone_number]
 * @property {string} [password]
 */

/**
 * @param {Object} data
 * @param {string} [data.name]
 * @param {string} [data.phone_number]
 * @param {string} [data.password]
 * @returns {TeacherUpdateRequest}
 */
export function buildTeacherUpdateRequest({ name, phone_number, password }) {
  const req = {};
  if (name !== undefined) req.name = name;
  if (phone_number !== undefined) req.phone_number = phone_number;
  if (password !== undefined) req.password = password;
  return req;
}
