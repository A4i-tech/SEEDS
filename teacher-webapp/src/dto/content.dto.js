/**
 * @typedef {Object} ThemeResponse
 * @property {string} name
 * @property {string} audio_url
 */

/**
 * @param {unknown} raw
 * @returns {ThemeResponse}
 */
export function parseThemeResponse(raw) {
  if (!raw?.name) throw new Error("ThemeResponse: missing name");
  return {
    name: raw.name,
    audio_url: raw.audio_url,
  };
}

/**
 * @typedef {{ english: string, local: string, audio_url?: string }} TitleField
 * @typedef {{ english: string, local?: string }} ThemeField
 * @typedef {{ audio_url: string, description?: string }} AudioContentItem
 *
 * @typedef {Object} ContentResponse
 * @property {string} id
 * @property {string} type
 * @property {string} language
 * @property {TitleField} title
 * @property {ThemeField} theme
 * @property {AudioContentItem[]} audio_content
 * @property {boolean} is_pull_model
 * @property {boolean} is_teacher_app
 * @property {boolean} is_processed
 * @property {string} creation_time
 * @property {Object[]} [questions]
 */

/**
 * @param {unknown} raw
 * @returns {ContentResponse}
 */
export function parseContentResponse(raw) {
  if (!raw?.id) throw new Error("ContentResponse: missing id");
  return {
    id: raw.id,
    type: raw.type,
    language: raw.language,
    title: raw.title,
    theme: raw.theme,
    audio_content: raw.audio_content || [],
    is_pull_model: raw.is_pull_model,
    is_teacher_app: raw.is_teacher_app,
    is_processed: raw.is_processed,
    creation_time: raw.creation_time,
    questions: raw.questions,
  };
}

/**
 * @typedef {Object} SasUrlResponse
 * @property {string} url
 */

/**
 * @param {unknown} raw
 * @returns {SasUrlResponse}
 */
export function parseSasUrlResponse(raw) {
  if (!raw?.url) throw new Error("SasUrlResponse: missing url");
  return { url: raw.url };
}

/**
 * @typedef {Object} SasTokenResponse
 * @property {string} sas_token
 */

/**
 * @param {unknown} raw
 * @returns {SasTokenResponse}
 */
export function parseSasTokenResponse(raw) {
  if (!raw?.sas_token) throw new Error("SasTokenResponse: missing sas_token");
  return { sas_token: raw.sas_token };
}

/**
 * @typedef {Object} JobScheduledResponse
 * @property {string} message
 * @property {string} job_id
 */

/**
 * @param {unknown} raw
 * @returns {JobScheduledResponse}
 */
export function parseJobScheduledResponse(raw) {
  if (!raw?.job_id) throw new Error("JobScheduledResponse: missing job_id");
  return { message: raw.message, job_id: raw.job_id };
}

/**
 * @typedef {Object} JobStatusResponse
 * @property {string} job_id
 * @property {string} status
 * @property {string} [content_id]
 */

/**
 * @param {unknown} raw
 * @returns {JobStatusResponse}
 */
export function parseJobStatusResponse(raw) {
  if (!raw?.job_id) throw new Error("JobStatusResponse: missing job_id");
  if (!raw?.status) throw new Error("JobStatusResponse: missing status");
  const result = { job_id: raw.job_id, status: raw.status };
  if (raw.content_id !== undefined) result.content_id = raw.content_id;
  return result;
}

/**
 * @typedef {Object} DeleteMatchedResponse
 * @property {number} matched
 */

/**
 * @param {unknown} raw
 * @returns {DeleteMatchedResponse}
 */
export function parseDeleteMatchedResponse(raw) {
  if (raw?.matched === undefined) throw new Error("DeleteMatchedResponse: missing matched");
  return { matched: raw.matched };
}
