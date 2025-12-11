/**
 * Get authorization headers with bearer token
 * @returns {Object} Headers object with Authorization
 */
export const getAuthHeaders = () => {
  const token = localStorage.getItem("authToken");
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
 * Get current user's tenant information
 * @returns {{tenantId: string|null, tenantName: string|null}}
 */
export const getTenantInfo = () => {
  return {
    tenantId: localStorage.getItem("tenantId"),
    tenantName: localStorage.getItem("tenantName"),
  };
};

/**
 * Clear all authentication data
 */
export const clearAuth = () => {
  localStorage.removeItem("authToken");
  localStorage.removeItem("tenantId");
  localStorage.removeItem("tenantName");
};
