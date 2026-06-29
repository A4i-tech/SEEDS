import { parseUserPublicResponse } from "./user.dto.js";

/**
 * @typedef {Object} LoginResponse
 * @property {string} token
 * @property {import('./user.dto.js').UserPublicResponse} user
 */

/**
 * @param {unknown} raw
 * @returns {LoginResponse}
 */
export function parseLoginResponse(raw) {
  if (!raw?.token) throw new Error("LoginResponse: missing token");
  if (!raw?.user) throw new Error("LoginResponse: missing user");
  return { token: raw.token, user: parseUserPublicResponse(raw.user) };
}

/**
 * @typedef {Object} MessageResponse
 * @property {string} message
 */

/**
 * @param {unknown} raw
 * @returns {MessageResponse}
 */
export function parseMessageResponse(raw) {
  if (!raw?.message) throw new Error("MessageResponse: missing message");
  return { message: raw.message };
}

/**
 * @typedef {Object} TeacherLoginRequest
 * @property {string} phone_number
 * @property {string} password
 * @property {string} [school_id]
 */

/**
 * @param {Object} data
 * @param {string} data.phone_number
 * @param {string} data.password
 * @param {string} [data.school_id]
 * @returns {TeacherLoginRequest}
 */
export function buildTeacherLoginRequest({ phone_number, password, school_id }) {
  if (!phone_number) throw new Error("TeacherLoginRequest: missing phone_number");
  if (!password) throw new Error("TeacherLoginRequest: missing password");
  const req = { phone_number, password };
  if (school_id !== undefined) req.school_id = school_id;
  return req;
}
