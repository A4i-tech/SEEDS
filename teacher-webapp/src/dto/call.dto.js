/**
 * @typedef {Object} ConferenceStatusResponse
 * @property {string} status
 * @property {string} id
 */

/**
 * @param {unknown} raw
 * @returns {ConferenceStatusResponse}
 */
export function parseConferenceStatusResponse(raw) {
  if (!raw?.status) throw new Error("ConferenceStatusResponse: missing status");
  if (!raw?.id) throw new Error("ConferenceStatusResponse: missing id");
  return { status: raw.status, id: raw.id };
}

/**
 * @typedef {Object} EventQueuedResponse
 * @property {string} message
 */

/**
 * @param {unknown} raw
 * @returns {EventQueuedResponse}
 */
export function parseEventQueuedResponse(raw) {
  if (!raw?.message) throw new Error("EventQueuedResponse: missing message");
  return { message: raw.message };
}

/**
 * @typedef {Object} CallStartRequest
 * @property {string} phone_number
 * @property {string} tenant_id
 */

/**
 * @param {Object} data
 * @param {string} data.phone_number
 * @param {string} data.tenant_id
 * @returns {CallStartRequest}
 */
export function buildCallStartRequest({ phone_number, tenant_id }) {
  if (!phone_number) throw new Error("CallStartRequest: missing phone_number");
  if (!tenant_id) throw new Error("CallStartRequest: missing tenant_id");
  return { phone_number, tenant_id };
}

/**
 * @typedef {Object} CreateConferenceRequest
 * @property {string} teacher_phone
 * @property {string[]} student_phones
 * @property {string} [leader_phone]
 * @property {string} [teacher_name]
 * @property {string[]} [student_names]
 */

/**
 * @param {Object} data
 * @param {string} data.teacher_phone
 * @param {string[]} data.student_phones
 * @param {string} [data.leader_phone]
 * @param {string} [data.teacher_name]
 * @param {string[]} [data.student_names]
 * @returns {CreateConferenceRequest}
 */
export function buildCreateConferenceRequest({
  teacher_phone,
  student_phones,
  leader_phone,
  teacher_name,
  student_names,
}) {
  if (!teacher_phone) throw new Error("CreateConferenceRequest: missing teacher_phone");
  if (!student_phones || !Array.isArray(student_phones))
    throw new Error("CreateConferenceRequest: missing student_phones array");
  const req = { teacher_phone, student_phones };
  if (leader_phone !== undefined) req.leader_phone = leader_phone;
  if (teacher_name !== undefined) req.teacher_name = teacher_name;
  if (student_names !== undefined) req.student_names = student_names;
  return req;
}
