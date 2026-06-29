// content.dto.js — request and response shapes for content endpoints

// ---------------------------------------------------------------------------
// Response typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ThemeResponse
 * @property {string} name
 * @property {string} audio_url
 */

/**
 * @typedef {Object} ContentResponse
 * @property {string} id
 * @property {string} type
 * @property {string} language
 * @property {{english: string, local: string, audio_url?: string}} title
 * @property {{english: string, local: string, audio_url?: string}} theme
 * @property {Array} [audio_content]
 * @property {boolean} is_pull_model
 * @property {boolean} [is_teacher_app]
 * @property {number} [creation_time]
 */

/**
 * @typedef {{id: string, text: string}} QuizOptionDTO
 * @typedef {{id: string, text: string}} QuizQuestionTextDTO
 * @typedef {{question: QuizQuestionTextDTO, options: QuizOptionDTO[], correct_option_id: string}} QuizQuestionItemDTO
 */

/**
 * @typedef {ContentResponse} QuizResponse
 * @property {QuizQuestionItemDTO[]} questions
 * @property {number} positive_marks
 * @property {number} negative_marks
 */

/**
 * @typedef {Object} ContentListPagination
 * @property {string|null} next_cursor
 * @property {boolean} has_more
 * @property {number} limit
 */

/**
 * @typedef {Object} ContentListResponse
 * @property {ContentResponse[]} data
 * @property {ContentListPagination} pagination
 */

/**
 * @typedef {Object} SasUrlResponse
 * @property {string} url
 */

/**
 * @typedef {Object} SasTokenResponse
 * @property {string} sas_token
 */

/**
 * @typedef {Object} JobScheduledResponse
 * @property {string} message
 * @property {string} job_id
 */

/**
 * @typedef {Object} JobStatusResponse
 * @property {string} job_id
 * @property {string} status
 * @property {string} [content_id]
 */

/**
 * @typedef {Object} DeleteMatchedResponse
 * @property {number} matched
 */

// ---------------------------------------------------------------------------
// Request typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ContentCreateRequest
 * @property {string} type
 * @property {string} language
 * @property {string} title
 * @property {string} theme
 * @property {string} [audio_content]
 * @property {boolean} is_pull_model
 * @property {boolean} [is_teacher_app]
 */

/**
 * @typedef {Object} ContentUpdateRequest
 * @property {string} id
 * @property {string} [type]
 * @property {string} [language]
 * @property {{english: string, local: string}} [title]
 * @property {{english: string, local: string}} [theme]
 * @property {Array} [audio_content]
 * @property {boolean} [is_pull_model]
 * @property {boolean} [is_teacher_app]
 * @property {QuizQuestionItemDTO[]} [questions]
 * @property {number} [positive_marks]
 * @property {number} [negative_marks]
 */

/**
 * @typedef {Object} QuizCreateRequest
 * @property {string} language
 * @property {{english: string, local: string}} title
 * @property {{english: string, local: string}} theme
 * @property {QuizQuestionItemDTO[]} questions
 * @property {number} positive_marks
 * @property {number} negative_marks
 * @property {boolean} [is_pull_model]
 * @property {boolean} [is_teacher_app]
 */

// ---------------------------------------------------------------------------
// Parse factories
// ---------------------------------------------------------------------------

/**
 * @param {unknown} raw
 * @returns {ContentResponse}
 */
export function parseContentResponse(raw) {
  if (!raw.id) throw new Error("ContentResponse: missing id");
  return {
    id: raw.id,
    type: raw.type,
    language: raw.language,
    title: raw.title,
    theme: raw.theme,
    audio_content: raw.audio_content,
    is_pull_model: raw.is_pull_model,
    is_teacher_app: raw.is_teacher_app,
    is_processed: raw.is_processed,
    creation_time: raw.creation_time,
    questions: raw.questions,
    positive_marks: raw.positive_marks,
    negative_marks: raw.negative_marks,
  };
}

/**
 * @param {unknown} raw
 * @returns {ContentListResponse}
 */
export function parseContentListResponse(raw) {
  if (!Array.isArray(raw.data)) throw new Error("ContentListResponse: missing data array");
  return {
    data: raw.data.map(parseContentResponse),
    pagination: {
      next_cursor: raw.pagination.next_cursor,
      has_more: raw.pagination.has_more,
      limit: raw.pagination.limit,
    },
  };
}

/**
 * @param {unknown} raw
 * @returns {SasUrlResponse}
 */
export function parseSasUrlResponse(raw) {
  if (!raw.url) throw new Error("SasUrlResponse: missing url");
  return { url: raw.url };
}

/**
 * @param {unknown} raw
 * @returns {SasTokenResponse}
 */
export function parseSasTokenResponse(raw) {
  if (!raw.sas_token) throw new Error("SasTokenResponse: missing sas_token");
  return { sas_token: raw.sas_token };
}

/**
 * @param {unknown} raw
 * @returns {JobScheduledResponse}
 */
export function parseJobScheduledResponse(raw) {
  if (!raw.job_id) throw new Error("JobScheduledResponse: missing job_id");
  return {
    message: raw.message,
    job_id: raw.job_id,
  };
}

/**
 * @param {unknown} raw
 * @returns {JobStatusResponse}
 */
export function parseJobStatusResponse(raw) {
  if (!raw.job_id) throw new Error("JobStatusResponse: missing job_id");
  return {
    job_id: raw.job_id,
    status: raw.status,
    content_id: raw.content_id,
  };
}

/**
 * @param {unknown} raw
 * @returns {DeleteMatchedResponse}
 */
export function parseDeleteMatchedResponse(raw) {
  if (raw.matched === undefined) throw new Error("DeleteMatchedResponse: missing matched");
  return { matched: raw.matched };
}

/**
 * Build a ContentCreateRequest body
 * @param {string} type
 * @param {string} language
 * @param {string} title
 * @param {string} theme
 * @param {boolean} is_pull_model
 * @param {string} [audio_content]
 * @param {boolean} [is_teacher_app]
 * @returns {ContentCreateRequest}
 */
export function buildContentCreateRequest(type, language, title, theme, is_pull_model, audio_content, is_teacher_app) {
  if (!type) throw new Error("ContentCreateRequest: type is required");
  if (!language) throw new Error("ContentCreateRequest: language is required");
  if (!title) throw new Error("ContentCreateRequest: title is required");
  if (!theme) throw new Error("ContentCreateRequest: theme is required");
  if (is_pull_model === undefined) throw new Error("ContentCreateRequest: is_pull_model is required");
  const req = { type, language, title, theme, is_pull_model };
  if (audio_content !== undefined) req.audio_content = audio_content;
  if (is_teacher_app !== undefined) req.is_teacher_app = is_teacher_app;
  return req;
}

/**
 * Build a ContentUpdateRequest body
 * @param {string} id
 * @param {Object} fields - Partial fields to update
 * @returns {ContentUpdateRequest}
 */
export function buildContentUpdateRequest(id, fields = {}) {
  if (!id) throw new Error("ContentUpdateRequest: id is required");
  const allowed = ["type", "language", "title", "theme", "audio_content", "is_pull_model"];
  const req = { id };
  for (const key of allowed) {
    if (fields[key] !== undefined) req[key] = fields[key];
  }
  return req;
}

/**
 * Build a QuizCreateRequest body
 * @param {string} language
 * @param {string} title
 * @param {string} theme
 * @param {Array} questions
 * @param {boolean} [is_pull_model]
 * @param {boolean} [is_teacher_app]
 * @returns {QuizCreateRequest}
 */
export function buildQuizCreateRequest(language, title, theme, questions, is_pull_model, is_teacher_app) {
  if (!language) throw new Error("QuizCreateRequest: language is required");
  if (!title) throw new Error("QuizCreateRequest: title is required");
  if (!theme) throw new Error("QuizCreateRequest: theme is required");
  if (!Array.isArray(questions)) throw new Error("QuizCreateRequest: questions must be an array");
  const req = { language, title, theme, questions };
  if (is_pull_model !== undefined) req.is_pull_model = is_pull_model;
  if (is_teacher_app !== undefined) req.is_teacher_app = is_teacher_app;
  return req;
}
