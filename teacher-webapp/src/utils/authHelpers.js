import { getAccessToken } from "./tokenStore";

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
 * Check if user is authenticated
 * @returns {boolean} True if token exists
 */
export const isAuthenticated = () => {
  return !!getAccessToken();
};
