import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders, isAuthenticated, clearAuth } from "../utils/authHelpers";
import { apiFetch } from "../services/api";
import { parseUserPublicResponse, parseTenantProfileResponse } from "../dto/index.js";

let cachedUserProfile = null;
let cachedUserPromise = null;

const resetUserCache = () => {
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
    const role = tokenPayload.role || tokenPayload.iss || null;
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
      .then((raw) => {
        // Tenant /me returns TenantProfileResponse; teacher/school_admin /me returns UserPublicResponse
        const parsed = role === "tenant"
          ? parseTenantProfileResponse(raw)
          : parseUserPublicResponse(raw);
        const profile = {
          ...parsed,
          role,
          name: nameFromToken || parsed.name || parsed.tenant_name,
        };
        cachedUserProfile = profile;
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
    if (cachedUserProfile && cachedUserProfile.name) {
      return cachedUserProfile.name;
    }
    const tokenPayload = getTokenPayload();
    if (tokenPayload.name) {
      return tokenPayload.name;
    }
    try {
      const profile = await getCurrentUser();
      return profile.name;
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
