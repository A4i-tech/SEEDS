import axios from "axios";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000;

const isRetryable = (error) => {
  // Retry on network errors (no response) or 5xx server errors
  if (!error.response) return true;
  return error.response.status >= 500;
};

const getBackoffDelay = (attempt) => {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_DELAY_MS;
  return exponential + jitter;
};

/**
 * Centralized axios instance with network-layer timeout configuration.
 */
const axiosInstance = axios.create({
  timeout: 5000, // 5 seconds timeout for all requests
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Request interceptor - can be used to add auth tokens, logging, etc.
 */
axiosInstance.interceptors.request.use(
  (config) => {
    config._retryCount = config._retryCount ?? 0;
    const token = localStorage.getItem("authToken");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - handles errors, timeout, and exponential backoff retries
 */
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const config = error.config;

    // Handle 401 Unauthorized - don't retry
    if (error.response?.status === 401) {
      console.error("Unauthorized (401): Clearing auth token and redirecting to login");
      localStorage.removeItem("authToken");
      window.location.href = "/";
      return Promise.reject(new Error("Session expired. Please login again."));
    }

    // Retry with exponential backoff
    if (config && isRetryable(error) && config._retryCount < MAX_RETRIES) {
      config._retryCount += 1;
      const delay = getBackoffDelay(config._retryCount);
      console.warn(
        `Retrying request (attempt ${config._retryCount}/${MAX_RETRIES}) in ${Math.round(delay)}ms:`,
        config.url
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return axiosInstance(config);
    }

    // Handle timeout errors from network layer
    if (error.code === "ECONNABORTED") {
      console.error("Request timed out at network layer:", config?.url);
      return Promise.reject(new Error("Request timed out. Please try again."));
    }

    // Handle other axios errors
    if (error.response) {
      console.error("Server error:", error.response.status, error.response.data);
    } else if (error.request) {
      console.error("Network error: No response received", error.request);
    } else {
      console.error("Request error:", error.message);
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
