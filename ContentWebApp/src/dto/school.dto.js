// school.dto.js — request and response shapes for school/classroom endpoints

// ---------------------------------------------------------------------------
// Response typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SchoolResponse
 * @property {string} id
 * @property {string} tenant_id
 * @property {string} name
 * @property {string} email
 * @property {boolean} is_active
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} ClassroomResponse
 * @property {string} id
 * @property {string} school_id
 * @property {string} name
 * @property {string|null} teacher
 * @property {string[]} students
 * @property {string[]} leaders
 * @property {string[]} content_ids
 * @property {string} created_at
 * @property {string} updated_at
 */

// ---------------------------------------------------------------------------
// Request typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SchoolCreateRequest
 * @property {string} name
 * @property {string} email
 * @property {string} password
 */

/**
 * @typedef {Object} SchoolUpdateRequest
 * @property {string} [name]
 * @property {string} [email]
 * @property {string} [password]
 */

/**
 * @typedef {Object} SchoolAnalyticsRequest
 * @property {string} start_date
 * @property {string} end_date
 */

/**
 * @typedef {Object} ClassroomUpsertRequest
 * @property {string} [id]
 * @property {string} [name]
 * @property {string[]} [students]
 * @property {string[]} [leaders]
 * @property {string[]} [content_ids]
 */

/**
 * @typedef {Object} TeacherTransferRequest
 * @property {string} teacher_id
 * @property {string} target_school_id
 */

// ---------------------------------------------------------------------------
// Parse factories
// ---------------------------------------------------------------------------

/**
 * @param {unknown} raw
 * @returns {SchoolResponse}
 */
export function parseSchoolResponse(raw) {
  if (!raw.id) throw new Error("SchoolResponse: missing id");
  return {
    id: raw.id,
    tenant_id: raw.tenant_id,
    name: raw.name,
    email: raw.email,
    is_active: raw.is_active,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/**
 * @param {unknown} raw
 * @returns {SchoolResponse[]}
 */
export function parseSchoolListResponse(raw) {
  const arr = raw.data;
  if (!Array.isArray(arr)) throw new Error("SchoolListResponse: expected array");
  return arr.map(parseSchoolResponse);
}

/**
 * @param {unknown} raw
 * @returns {ClassroomResponse}
 */
export function parseClassroomResponse(raw) {
  if (!raw.id) throw new Error("ClassroomResponse: missing id");
  return {
    id: raw.id,
    school_id: raw.school_id,
    name: raw.name,
    teacher: raw.teacher,
    students: raw.students,
    leaders: raw.leaders,
    content_ids: raw.content_ids,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/**
 * Build a SchoolCreateRequest body
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns {SchoolCreateRequest}
 */
export function buildSchoolCreateRequest(name, email, password) {
  if (!name) throw new Error("SchoolCreateRequest: name is required");
  if (!email) throw new Error("SchoolCreateRequest: email is required");
  if (!password) throw new Error("SchoolCreateRequest: password is required");
  return { name, email, password };
}

/**
 * Build a SchoolUpdateRequest body
 * @param {string} [name]
 * @param {string} [email]
 * @param {string} [password]
 * @returns {SchoolUpdateRequest}
 */
export function buildSchoolUpdateRequest(name, email, password) {
  const req = {};
  if (name !== undefined && name !== null) req.name = name;
  if (email !== undefined && email !== null) req.email = email;
  if (password) req.password = password;
  return req;
}

/**
 * Build a TeacherTransferRequest body
 * @param {string} teacher_id
 * @param {string} target_school_id
 * @returns {TeacherTransferRequest}
 */
export function buildTeacherTransferRequest(teacher_id, target_school_id) {
  if (!teacher_id) throw new Error("TeacherTransferRequest: teacher_id is required");
  if (!target_school_id) throw new Error("TeacherTransferRequest: target_school_id is required");
  return { teacher_id, target_school_id };
}

/**
 * Build a SchoolAnalyticsRequest body
 * @param {string} start_date - ISO date string
 * @param {string} end_date - ISO date string
 * @returns {SchoolAnalyticsRequest}
 */
export function buildSchoolAnalyticsRequest(start_date, end_date) {
  if (!start_date) throw new Error("SchoolAnalyticsRequest: start_date is required");
  if (!end_date) throw new Error("SchoolAnalyticsRequest: end_date is required");
  return { start_date, end_date };
}
