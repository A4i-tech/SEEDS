// auth.dto.js — request and response shapes for auth/tenant endpoints

// ---------------------------------------------------------------------------
// Response typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TenantProfileResponse
 * @property {string} id
 * @property {string} email
 * @property {string} tenant_name
 * @property {string} [name]
 * @property {string} [organisation]
 * @property {boolean} [is_active]
 * @property {string} [created_at]
 * @property {string} [updated_at]
 */

/**
 * @typedef {Object} LoginResponse
 * @property {string} token
 * @property {import('./user.dto.js').UserPublicResponse} user
 */

/**
 * @typedef {Object} MessageResponse
 * @property {string} message
 */

// ---------------------------------------------------------------------------
// Request typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TenantLoginRequest
 * @property {string} email
 * @property {string} password
 */

/**
 * @typedef {Object} SchoolAdminLoginRequest
 * @property {string} email
 * @property {string} password
 */

/**
 * @typedef {Object} TenantRegisterRequest
 * @property {string} email
 * @property {string} password
 * @property {string} tenant_name
 * @property {string} [name]
 */

/**
 * @typedef {Object} TenantAnalyticsRequest
 * @property {string} start_date
 * @property {string} end_date
 */

// ---------------------------------------------------------------------------
// Parse factories
// ---------------------------------------------------------------------------

/**
 * @param {unknown} raw
 * @returns {LoginResponse}
 */
export function parseLoginResponse(raw) {
  if (!raw.token) throw new Error("LoginResponse: missing token");
  return {
    token: raw.token,
    user: raw.user,
  };
}

/**
 * @param {unknown} raw
 * @returns {TenantProfileResponse}
 */
export function parseTenantProfileResponse(raw) {
  if (!raw.id) throw new Error("TenantProfileResponse: missing id");
  return {
    id: raw.id,
    email: raw.email,
    tenant_name: raw.tenant_name,
    name: raw.name,
    organisation: raw.organisation,
    is_active: raw.is_active,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/**
 * @param {unknown} raw
 * @returns {MessageResponse}
 */
export function parseMessageResponse(raw) {
  if (!raw.message) throw new Error("MessageResponse: missing message");
  return { message: raw.message };
}

/**
 * Build a TenantLoginRequest body
 * @param {string} email
 * @param {string} password
 * @returns {TenantLoginRequest}
 */
export function buildTenantLoginRequest(email, password) {
  if (!email) throw new Error("TenantLoginRequest: email is required");
  if (!password) throw new Error("TenantLoginRequest: password is required");
  return { email, password };
}

/**
 * Build a TenantRegisterRequest body
 * @param {string} email
 * @param {string} password
 * @param {string} tenant_name
 * @param {string} [name]
 * @returns {TenantRegisterRequest}
 */
export function buildTenantRegisterRequest(email, password, tenant_name, name) {
  if (!email) throw new Error("TenantRegisterRequest: email is required");
  if (!password) throw new Error("TenantRegisterRequest: password is required");
  if (!tenant_name) throw new Error("TenantRegisterRequest: tenant_name is required");
  const req = { email, password, tenant_name };
  if (name) req.name = name;
  return req;
}

/**
 * Build a TenantAnalyticsRequest body
 * @param {string} start_date - ISO date string
 * @param {string} end_date - ISO date string
 * @returns {TenantAnalyticsRequest}
 */
export function buildTenantAnalyticsRequest(start_date, end_date) {
  if (!start_date) throw new Error("TenantAnalyticsRequest: start_date is required");
  if (!end_date) throw new Error("TenantAnalyticsRequest: end_date is required");
  return { start_date, end_date };
}
