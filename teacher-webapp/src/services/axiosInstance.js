import axios from "axios";

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
    // Add auth token if available (for authenticated endpoints)
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
 * Response interceptor - handles errors and timeout at network layer
 */
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle timeout errors from network layer
    if (error.code === "ECONNABORTED") {
      console.error("Request timed out at network layer:", error.config?.url);
      return Promise.reject(new Error("Request timed out. Please try again."));
    }

    // Handle other axios errors
    if (error.response) {
      // Server responded with error status
      console.error("Server error:", error.response.status, error.response.data);
    } else if (error.request) {
      // Request was made but no response received
      console.error("Network error: No response received", error.request);
    } else {
      // Something else happened
      console.error("Request error:", error.message);
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
