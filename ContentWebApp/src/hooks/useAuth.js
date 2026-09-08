import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders, getTokenPayload } from "../utils/authHelpers";
import { apiFetch } from "../services/api";
import { TeacherDto } from "../dto/TeacherDto";
import { useAuthContext } from "../contexts/AuthContext";

let cachedUserProfile = null;
let cachedUserPromise = null;

export const resetUserCache = () => {
  cachedUserProfile = null;
  cachedUserPromise = null;
};

export const useAuth = () => {
  const navigate = useNavigate();
  const { logout: contextLogout, isAuthenticated } = useAuthContext();

  const getHeaders = useCallback(() => {
    return getAuthHeaders();
  }, []);

  const logout = useCallback(async () => {
    await contextLogout();
    resetUserCache();
    navigate("/");
  }, [contextLogout, navigate]);

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
      .then((req) => {
        const profile = TeacherDto.fromApi(req);
        profile.role = role;
        profile.name = nameFromToken || profile.name || profile.tenant_name;
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
    if (cachedUserProfile?.name) {
      return cachedUserProfile.name;
    }
    const tokenPayload = getTokenPayload();
    if (tokenPayload.name) {
      return tokenPayload.name;
    }
    try {
      const profile = await getCurrentUser();
      return profile.name || "";
    } catch (err) {
      return "";
    }
  }, [getCurrentUser]);

  return {
    getAuthHeaders: getHeaders,
    logout,
    getCurrentUser,
    getCurrentUserName,
    isAuthenticated,
  };
};
