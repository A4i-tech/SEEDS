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
 * @param {unknown} raw
 * @returns {SchoolResponse}
 */
export function parseSchoolResponse(raw) {
  if (!raw?.id) throw new Error("SchoolResponse: missing id");
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
 * @typedef {Object} ClassroomResponse
 * @property {string} id
 * @property {string} school_id
 * @property {string} name
 * @property {string} teacher
 * @property {string[]} students
 * @property {string[]} leaders
 * @property {string[]} content_ids
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @param {unknown} raw
 * @returns {ClassroomResponse}
 */
export function parseClassroomResponse(raw) {
  if (!raw?.id) throw new Error("ClassroomResponse: missing id");
  return {
    id: raw.id,
    school_id: raw.school_id,
    name: raw.name,
    teacher: raw.teacher,
    students: Array.isArray(raw.students) ? raw.students : [],
    leaders: Array.isArray(raw.leaders) ? raw.leaders : [],
    content_ids: Array.isArray(raw.content_ids) ? raw.content_ids : [],
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/**
 * @typedef {Object} ClassroomUpsertRequest
 * @property {string} [id]
 * @property {string} [name]
 * @property {string[]} [students]
 * @property {string[]} [leaders]
 * @property {string[]} [content_ids]
 */

/**
 * @param {Object} data
 * @param {string} [data.id]
 * @param {string} [data.name]
 * @param {string[]} [data.students]
 * @param {string[]} [data.leaders]
 * @param {string[]} [data.content_ids]
 * @returns {ClassroomUpsertRequest}
 */
export function buildClassroomUpsertRequest({ id, name, students, leaders, content_ids }) {
  const req = {};
  if (id !== undefined) req.id = id;
  if (name !== undefined) req.name = name;
  if (students !== undefined) req.students = students;
  if (leaders !== undefined) req.leaders = leaders;
  if (content_ids !== undefined) req.content_ids = content_ids;
  return req;
}

/**
 * @typedef {Object} TeacherTransferRequest
 * @property {string} teacher_id
 * @property {string} target_school_id
 */

/**
 * @param {Object} data
 * @param {string} data.teacher_id
 * @param {string} data.target_school_id
 * @returns {TeacherTransferRequest}
 */
export function buildTeacherTransferRequest({ teacher_id, target_school_id }) {
  if (!teacher_id) throw new Error("TeacherTransferRequest: missing teacher_id");
  if (!target_school_id) throw new Error("TeacherTransferRequest: missing target_school_id");
  return { teacher_id, target_school_id };
}
