/**
 * Get authorization headers with bearer token
 * @returns {Object} Headers object with Authorization
 */
export const getAuthHeaders = () => {
  const token = localStorage.getItem("authToken");
  if (!token) {
    throw new Error("No auth token found");
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
  return !!localStorage.getItem("authToken");
};

/**
 * Persist auth data after login
 * @param {string} token - JWT token
 * @param {string} role - "tenant" | "school_admin" | "content_creator" | "teacher"
 * @param {string|null} schoolId - Required for school_admin, content_creator, and teacher
 */
export const setAuth = (token, role, schoolId = null) => {
  localStorage.setItem("authToken", token);
  localStorage.setItem("userRole", role);
  if (schoolId) localStorage.setItem("schoolId", schoolId);
};

/**
 * Get stored user role
 * @returns {"tenant"|"school_admin"|"content_creator"|"teacher"|null}
 */
export const getRole = () => localStorage.getItem("userRole");

/**
 * Get stored school ID (school_admin, content_creator, teacher)
 * @returns {string|null}
 */
export const getSchoolId = () => localStorage.getItem("schoolId");

/**
 * Clear all authentication data
 */
export const clearAuth = () => {
  localStorage.removeItem("authToken");
  localStorage.removeItem("userRole");
  localStorage.removeItem("schoolId");
};
