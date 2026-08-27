import { getAccessToken, setAccessToken, clearAccessToken } from "../utils/tokenStore";
import { clearAuth } from "../utils/authHelpers";
import { SEEDS_URL } from "../Constants";

export class ApiError extends Error {
  constructor(message, status, response) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.response = response;
  }
}

let refreshPromise = null;

export const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${SEEDS_URL}/auth/token/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("refresh failed");
        }
        const data = await response.json();
        setAccessToken(data.access_token);
        return data.access_token;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
};

export const initSession = async () => {
  try {
    await refreshAccessToken();
    return { data: true, error: null };
  } catch (error) {
    clearAccessToken();
    return { data: null, error };
  }
};

/**
 * Generic fetch wrapper with error handling
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} - Parsed JSON response
 */
export const apiFetch = async (url, options = {}, _isRetry = false) => {
  try {
    const response = await fetch(url, { credentials: "include", ...options });

    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && getAccessToken() && !_isRetry) {
        try {
          const newToken = await refreshAccessToken();
          return await apiFetch(
            url,
            { ...options, headers: { ...options.headers, Authorization: `Bearer ${newToken}` } },
            true
          );
        } catch (_refreshError) {
          clearAuth();
          if (typeof window !== "undefined" && window.location.pathname !== "/") {
            window.location.href = "/";
          }
        }
      } else if (response.status === 401 || response.status === 403) {
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
    if (contentType && contentType.includes("application/json")) {
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
 * @param {Object} params - Key-value pairs
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
