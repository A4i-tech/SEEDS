import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SEEDS_URL } from "../Constants";
import {
  getAuthHeaders,
  isAuthenticated,
  clearAuth,
} from "../utils/authHelpers";
import { apiFetch } from "../services/api";

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
  const getCurrentUser = useCallback(async () => {
    const req = await apiFetch(`${SEEDS_URL}/tenant/me`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    console.log("Current User Info:", req);
    const tenantName = req.tenantName;
    return tenantName || "User";
  }, []);

  return {
    getAuthHeaders: getHeaders,
    logout,
    getCurrentUser,
    isAuthenticated: isAuthenticated(),
  };
};
