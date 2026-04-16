import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders, isAuthenticated, clearAuth, getRole } from "../utils/authHelpers";
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

  const getHeaders = useCallback(() => {
    return getAuthHeaders();
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    resetUserCache();
    navigate("/");
  }, [navigate]);

  const getCurrentUser = useCallback(async () => {
    if (cachedUserProfile) {
      return cachedUserProfile;
    }
    if (cachedUserPromise) {
      return cachedUserPromise;
    }

    const role = getRole();
    const meUrl =
      role === "school_admin"
        ? `${SEEDS_URL}/school/admin/me`
        : role === "teacher" || role === "content_creator"
          ? `${SEEDS_URL}/teacher/me`
          : `${SEEDS_URL}/tenant/me`;

    cachedUserPromise = apiFetch(meUrl, {
      method: "GET",
      headers: getAuthHeaders(),
    })
      .then((req) => {
        const profile = {
          ...req,
          role: req.role || role || "tenant",
          name: req.name || req.tenantName || req.schoolName || "User",
        };
        cachedUserProfile = profile;
        cachedTenantName = profile.name;
        cachedUserPromise = null;
        return cachedUserProfile;
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
