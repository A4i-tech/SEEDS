import { useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getAuthHeaders, isAuthenticated, getTenantInfo, clearAuth } from "../utils/authHelpers";

export const useAuth = () => {
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Check authentication and redirect if not authenticated
   */
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/");
    }
  }, [navigate, location]);

  /**
   * Get authentication headers
   */
  const getHeaders = useCallback(() => {
    return getAuthHeaders();
  }, []);

  /**
   * Logout user and clear all auth data
   */
  const logout = useCallback(() => {
    clearAuth();
    navigate("/");
  }, [navigate]);

  /**
   * Get current user info
   */
  const getCurrentUser = useCallback(() => {
    const { tenantName } = getTenantInfo();
    return tenantName || "User";
  }, []);

  return {
    getAuthHeaders: getHeaders,
    logout,
    getCurrentUser,
    isAuthenticated: isAuthenticated(),
    tenantInfo: getTenantInfo(),
  };
};
