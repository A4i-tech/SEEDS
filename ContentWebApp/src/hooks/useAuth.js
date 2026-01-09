import { useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders, isAuthenticated, clearAuth } from "../utils/authHelpers";
import { apiFetch } from "../services/api";

let cachedTenantName = null;
let cachedUserPromise = null;

const resetUserCache = () => {
  cachedTenantName = null;
  cachedUserPromise = null;
};

export const useAuth = () => {
  const navigate = useNavigate();

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
    resetUserCache();
    navigate("/");
  }, [navigate]);

  /**
   * Get current user info
   */
  const getCurrentUser = useCallback(async () => {
    if (cachedTenantName) {
      return cachedTenantName;
    }

    if (cachedUserPromise) {
      return cachedUserPromise;
    }

    cachedUserPromise = apiFetch(`${SEEDS_URL}/tenant/me`, {
      method: "GET",
      headers: getAuthHeaders(),
    })
      .then((req) => {
        console.log("Current User Info:", req);
        cachedTenantName = req.tenantName || "User";
        cachedUserPromise = null;
        return cachedTenantName;
      })
      .catch((err) => {
        cachedUserPromise = null;
        throw err;
      });

    return cachedUserPromise;
  }, []);

  return {
    getAuthHeaders: getHeaders,
    logout,
    getCurrentUser,
    isAuthenticated: isAuthenticated(),
  };
};
