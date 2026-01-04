import { useCallback } from "react";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

// Cache variables outside component to persist across renders
let cachedUserInfo = null;
let cachedUserPromise = null;

/**
 * Custom hook for authentication and user information
 * Implements caching to avoid redundant API calls
 */
export const useAuth = () => {
  const getAuthHeaders = () => {
    const token = localStorage.getItem("authToken");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const getCurrentUser = useCallback(async () => {
    // Return cached user info if available
    if (cachedUserInfo) {
      return cachedUserInfo;
    }

    // Return pending promise if request is already in flight
    if (cachedUserPromise) {
      return cachedUserPromise;
    }

    // Make new API request
    cachedUserPromise = fetch(API_ENDPOINTS.GET_CURRENT_USER, {
      method: "GET",
      headers: getAuthHeaders(),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("Current User Info:", data);
        cachedUserInfo = data;
        cachedUserPromise = null;
        return cachedUserInfo;
      })
      .catch((err) => {
        cachedUserPromise = null;
        console.error("Error fetching current user:", err);
        throw err;
      });

    return cachedUserPromise;
  }, []);

  const clearUserCache = useCallback(() => {
    cachedUserInfo = null;
    cachedUserPromise = null;
  }, []);

  return {
    getCurrentUser,
    clearUserCache,
    getAuthHeaders,
  };
};
