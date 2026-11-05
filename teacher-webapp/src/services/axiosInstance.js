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

axiosInstance.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const getStatus = (error) => (error.response ? error.response.status : 0);

let refreshing = false;
let refreshPromise = Promise.resolve("");

const requestTokenRefresh = async () => {
  try {
    const response = await axios.post(API_ENDPOINTS.REFRESH, {}, { withCredentials: true });
    setAccessToken(response.data.access_token);
    return response.data.access_token;
  } finally {
    refreshing = false;
  }
};

export const refreshAccessToken = () => {
  if (!refreshing) {
    refreshing = true;
    refreshPromise = requestTokenRefresh();
  }
  return refreshPromise;
};

export const initSession = async () => {
  try {
    await refreshAccessToken();
    return true;
  } catch (error) {
    console.error("axiosInstance: session init failed", error);
    clearAccessToken();
    return false;
  }
};

axiosInstance.interceptors.response.use(
  undefined,
  async (error) => {
    error.status = getStatus(error);
    const originalRequest = error.config;

    // Backend-driven auth invalidation. Skip when no token is stored (login attempt) so caller sees real error.
    if (error.status === 401 && getAccessToken() && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        console.error("axiosInstance: token refresh failed", refreshError);
        if (getStatus(refreshError) !== 401) {
          return Promise.reject(refreshError);
        }
        clearAccessToken();
        window.location.href = "/";
        const sessionExpiredError = new Error("Session expired. Please login again.");
        sessionExpiredError.status = 401;
        return Promise.reject(sessionExpiredError);
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
