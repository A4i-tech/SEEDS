import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentTeacher as fetchCurrentTeacher } from "../services/teacherService";
import { isAuthenticated, clearAuth as clearAuthHelper } from "../utils/authHelpers";
import { clearSessionHistory } from "../services/sessionHistoryService";

// Module-level cache to prevent redundant API calls
let cachedTeacher = null;
let cachedTeacherPromise = null;

/**
 * Reset teacher cache (called on logout)
 */
const resetTeacherCache = () => {
  cachedTeacher = null;
  cachedTeacherPromise = null;
};

/**
 * Custom hook for authentication operations
 * Provides centralized auth management with caching
 *
 * @returns {Object} Auth methods and state
 * @property {Function} getAuthHeaders - Get headers with auth token
 * @property {Function} logout - Logout and clear all auth data
 * @property {Function} getCurrentTeacher - Get current teacher info (cached)
 * @property {boolean} isAuthenticated - Whether user is authenticated
 */
export const useAuth = () => {
  const navigate = useNavigate();

  /**
   * Get authentication headers
   */
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("authToken");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, []);

  /**
   * Logout user and clear all auth data
   */
  const logout = useCallback(() => {
    clearAuthHelper(); // Clears token
    clearSessionHistory(); // Clear session history
    resetTeacherCache();
    navigate("/");
  }, [navigate]);

  /**
   * Get current teacher information
   * Uses module-level cache to prevent redundant API calls
   * Handles concurrent requests with promise deduplication
   *
   * @returns {Promise<Object>} Teacher data: { phoneNumber, name, email, tenantId, ... }
   */
  const getCurrentTeacher = useCallback(async () => {
    // Return cached data if available
    if (cachedTeacher) {
      return cachedTeacher;
    }

    // Return in-flight promise if request is already pending
    if (cachedTeacherPromise) {
      return cachedTeacherPromise;
    }

    // Create new promise for API call
    cachedTeacherPromise = await fetchCurrentTeacher();
    cachedTeacher = cachedTeacherPromise;
    cachedTeacherPromise = null;
    return cachedTeacher;
  }, []);

  return {
    getAuthHeaders,
    logout,
    getCurrentTeacher,
    isAuthenticated: isAuthenticated(),
  };
};

// Export reset function for testing or manual cache clearing
export { resetTeacherCache };
