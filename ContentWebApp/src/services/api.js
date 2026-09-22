import { fetchEventSource } from "@microsoft/fetch-event-source";

import { clearAuth } from "../utils/authHelpers";

export class ApiError extends Error {
  constructor(message, status, response) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.response = response;
  }
}

/**
 * Generic fetch wrapper with error handling
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} - Parsed JSON response
 */
export const apiFetch = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuth();
        if (typeof window !== "undefined" && window.location.pathname !== "/") {
          window.location.href = "/";
        }
      }
      const text = await response.text();
      throw new ApiError(
        text || `Request failed with status ${response.status}`,
        response.status,
        response
      );
    }

    // Handle empty responses
    const contentType = response.headers.get("content-type");
    if (response.status !== 204 && contentType && contentType.includes("application/json")) {
      return await response.json();
    }

    return await response.text();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || "Network request failed", 0, null);
  }
};

/**
 * Build query parameters from object
 * @param {Object} params - Key-value pairs for query string
 * @returns {string} - Query string
 */
export const buildQueryString = (params) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== null && item !== undefined) {
            searchParams.append(key, String(item));
          }
        });
      } else {
        searchParams.append(key, String(value));
      }
    }
  });
  return searchParams.toString();
};

const apiFetchRaw = async (url, { headers, signal } = {}) => {
  const response = await fetch(url, { headers, signal });
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status, response);
  }
  return response;
};

export const apiFetchText = async (url, options) => (await apiFetchRaw(url, options)).text();

export const apiFetchBlob = async (url, options) => (await apiFetchRaw(url, options)).blob();

export const streamSse = (url, onEvent, { headers, signal } = {}) =>
  fetchEventSource(url, {
    headers,
    signal,
    openWhenHidden: true,
    async onopen(response) {
      if (!response.ok) {
        throw new ApiError(`Failed to open stream (status ${response.status})`, response.status, response);
      }
    },
    onmessage(event) {
      try {
        onEvent(JSON.parse(event.data));
      } catch (parseError) {
        // One malformed frame shouldn't end the whole stream — later frames are independent.
        console.error("streamSse: dropping malformed SSE frame", parseError);
      }
    },
    // No onclose needed: fetch-event-source resolves this promise on its own once the
    // stream ends cleanly (job reached a terminal state) — it only retries on error.
    onerror(err) {
      if (err instanceof ApiError) {
        throw err; // fatal — stop retrying, this status will never succeed, rejects the returned promise
      }
      // transient network error — returning nothing tells fetch-event-source to retry with backoff
    },
  });
