import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { getAuthHeaders } from "../utils/authHelpers";

/**
 * Build query string from parameters object
 * @param {Object} params - Query parameters
 * @returns {string} - Query string
 */
const buildQueryString = (params) => {
  const queryParams = new URLSearchParams();
  
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== "") {
      queryParams.append(key, value);
    }
  });
  
  return queryParams.toString();
};

/**
 * Fetch content from the backend API with support for query parameters and cursor-based pagination
 * 
 * @param {Object} options - Query options
 * @param {string} options.language - Language code (e.g., 'en', 'hi')
 * @param {string} options.theme - Theme name in English (URL encoded)
 * @param {string} options.expName - Content type/experience name
 * @param {boolean} options.onlyTeacherApp - If true, returns only teacher app content
 * @param {string|Array} options.ids - Comma-separated list of content IDs or array of IDs
 * @param {number} options.limit - Number of items to return per page (default: 15)
 * @param {string} options.cursor - Cursor ID for pagination (format: "timestamp_id")
 * @returns {Promise<Object>} Response with data and pagination info
 * @throws {Error} If API call fails
 */
export const getContent = async (options = {}) => {
  const {
    language,
    theme,
    expName,
    onlyTeacherApp,
    ids,
    limit = 15,
    cursor,
  } = options;

  const params = {};
  
  if (language) params.language = language;
  if (theme) params.theme = encodeURIComponent(theme);
  if (expName) params.expName = expName;
  if (onlyTeacherApp !== undefined) params.onlyTeacherApp = onlyTeacherApp;
  if (ids) {
    // Handle both string (comma-separated) and array formats
    params.ids = Array.isArray(ids) ? ids.join(",") : ids;
  }
  if (limit) params.limit = limit;
  if (cursor) params.cursor = cursor;

  const queryString = buildQueryString(params);
  const url = queryString
    ? `${API_ENDPOINTS.GET_CONTENT}?${queryString}`
    : API_ENDPOINTS.GET_CONTENT;

  const response = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch content");
  }

  return response.json();
};

/**
 * Get SAS URL for a content audio URL
 * 
 * @param {string} audioUrl - The blob URL to generate a SAS token for
 * @returns {Promise<string>} SAS URL with authentication token
 * @throws {Error} If API call fails
 */
export const getContentSasUrl = async (audioUrl) => {
  if (!audioUrl) {
    throw new Error("Audio URL is required");
  }

  const queryString = `url=${encodeURIComponent(audioUrl)}`;
  const url = `${API_ENDPOINTS.GET_CONTENT_SAS_URL}?${queryString}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch SAS URL");
  }

  const data = await response.json();
  return data.url;
};

/**
 * Fetch a single content item by ID
 * 
 * @param {string} contentId - The content ID (_id)
 * @returns {Promise<Object>} Content object
 * @throws {Error} If API call fails
 */
export const getContentById = async (contentId) => {
  if (!contentId) {
    throw new Error("Content ID is required");
  }

  const response = await fetch(`${API_ENDPOINTS.GET_CONTENT}/${contentId}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Content not found");
    }
    throw new Error("Failed to fetch content");
  }

  return response.json();
};
