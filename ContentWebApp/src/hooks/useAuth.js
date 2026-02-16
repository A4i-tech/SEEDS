import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders, isAuthenticated, clearAuth } from "../utils/authHelpers";
import { apiFetch } from "../services/api";

let cachedTenantName = null;
let cachedUserProfile = null;
let cachedUserPromise = null;

const resetUserCache = () => {
  cachedTenantName = null;
  cachedUserProfile = null;
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
        cachedUserProfile = req;
        cachedTenantName = req.name || req.tenantName || "User";
        cachedUserPromise = null;
        return cachedTenantName;
      })
      .catch((err) => {
        cachedUserPromise = null;
        throw err;
      });

    return cachedUserPromise;
  }, []);

  const getCurrentUserProfile = useCallback(async () => {
    if (cachedUserProfile) {
      return cachedUserProfile;
    }
    await getCurrentUser();
    return cachedUserProfile;
  }, [getCurrentUser]);

  return {
    getAuthHeaders: getHeaders,
    logout,
    getCurrentUser,
    getCurrentUserProfile,
    isAuthenticated: isAuthenticated(),
  };
};
