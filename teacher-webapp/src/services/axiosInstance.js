import axios from "axios";
import { clearAuth } from "../utils/authHelpers";

const axiosInstance = axios.create({
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
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

axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Backend-driven auth invalidation. Skip when no token is stored (login attempt) so caller sees real error.
    if (
      (error.response?.status === 401 || error.response?.status === 403) &&
      localStorage.getItem("authToken")
    ) {
      clearAuth();
      window.location.href = "/";
      return Promise.reject(new Error("Session expired. Please login again."));
    }

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
