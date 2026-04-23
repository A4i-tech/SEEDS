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

const getTokenPayload = () => {
  const token = localStorage.getItem("authToken");
  if (!token) {
    return {};
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return {};
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    return JSON.parse(atob(padded));
  } catch (_error) {
    return {};
  }
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

    const tokenPayload = getTokenPayload();
    const role = tokenPayload.role || null;
    const nameFromToken = tokenPayload.name || null;
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
          role: req.role || role,
          name: nameFromToken || req.name || req.tenantName || req.schoolName,
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

  const getCurrentUserName = useCallback(async () => {
    if (cachedTenantName) return cachedTenantName;
    const tokenPayload = getTokenPayload();
    if (tokenPayload.name) {
      cachedTenantName = tokenPayload.name;
      return cachedTenantName;
    }
    try {
      const profile = await getCurrentUser();
      return profile?.name || "";
    } catch (err) {
      return "";
    }
  }, [getCurrentUser]);

  return {
    getAuthHeaders: getHeaders,
    logout,
    getCurrentUser,
    getCurrentUserName,
    isAuthenticated: isAuthenticated(),
  };
};
