import axios from "axios";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { getAccessToken, setAccessToken, clearAccessToken } from "../utils/tokenStore";

const axiosInstance = axios.create({
  timeout: 30000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

let refreshPromise = null;

export const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await axios.post(API_ENDPOINTS.REFRESH, {}, { withCredentials: true });
        setAccessToken(response.data.access_token);
        return response.data.access_token;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
};

axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && getAccessToken() && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        clearAccessToken();
        window.location.href = "/";
        return Promise.reject(new Error("Session expired. Please login again."));
      }
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
