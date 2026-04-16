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
    if (cachedUserProfile) {
      return cachedUserProfile;
    }
    if (cachedUserPromise) {
      return cachedUserPromise;
    }

    cachedUserPromise = apiFetch(`${SEEDS_URL}/tenant/me`, {
      method: "GET",
      headers: getAuthHeaders(),
    })
      .then((req) => {
        cachedUserProfile = req;
        cachedTenantName = req.name;
        cachedUserPromise = null;
        return cachedUserProfile;
      })
      .catch((err) => {
        cachedUserPromise = null;
        throw err;
      });

    return cachedUserPromise;
  }, []);

  const getCurrentUserName = useCallback(async () => {
    if (cachedTenantName) {
      return cachedTenantName;
    }
    const profile = await getCurrentUser();
    cachedTenantName = profile.name;
    return cachedTenantName;
  }, [getCurrentUser]);

  return {
    getAuthHeaders: getHeaders,
    logout,
    getCurrentUser,
    getCurrentUserName,
    isAuthenticated: isAuthenticated(),
  };
};
