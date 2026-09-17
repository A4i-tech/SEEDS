import { getAccessToken, clearAccessToken } from "./tokenStore";

/**
 * Check if localStorage is available and accessible
 * @returns {boolean} True if localStorage can be used
 */
export const isLocalStorageAvailable = () => {
  try {
    const test = "__localStorage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Get authentication headers with token
 * @returns {Object} Headers object with Authorization
 */
export const getAuthHeaders = () => {
  const token = getAccessToken();

  if (!token) {
    return null;
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

/**
 * Check if user is authenticated
 * @returns {boolean} True if token exists
 */
export const isAuthenticated = () => {
  return !!getAccessToken();
};

/**
 * Clear all authentication data
 */
export const clearAuth = () => {
  clearAccessToken();
};
