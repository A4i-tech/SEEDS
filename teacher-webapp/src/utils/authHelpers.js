/**
 * Check if user is authenticated
 * @returns {boolean} True if token exists
 */
export const isAuthenticated = () => {
  return !!localStorage.getItem("authToken");
};

/**
 * Clear all authentication data
 */
export const clearAuth = () => {
  localStorage.removeItem("authToken");
  // Clear user cache when logging out
  if (typeof window !== "undefined") {
    // Trigger cache clear by dispatching event or direct module import
    window.dispatchEvent(new Event("auth-cleared"));
  }
};
