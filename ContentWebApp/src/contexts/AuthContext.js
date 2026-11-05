import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SEEDS_URL } from "../Constants";
import { apiFetch, initSession } from "../services/api";
import { setAccessToken, getAccessToken } from "../utils/tokenStore";
import { clearAuth } from "../utils/authHelpers";

const IDLE_LOGIN_STATE = { status: "idle", data: {}, error: "" };

const AuthContext = createContext({ provided: false });

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initStatus, setInitStatus] = useState("loading");

  useEffect(() => {
    const init = async () => {
      const { ok, error } = await initSession();
      if (error) {
        console.error("AuthProvider: session init failed", error);
      }
      setIsAuthenticated(ok);
      setInitStatus(ok ? "ok" : "error");
    };
    init();
  }, []);

  const [loginState, setLoginState] = useState(IDLE_LOGIN_STATE);
  const login = useCallback(async (body) => {
    setLoginState({ ...IDLE_LOGIN_STATE, status: "loading" });
    try {
      const data = await apiFetch(`${SEEDS_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      setAccessToken(data.token);
      setIsAuthenticated(true);
      setLoginState({ ...IDLE_LOGIN_STATE, status: "ok", data });
      return data;
    } catch (error) {
      console.error("AuthProvider: login failed", error);
      setLoginState({ ...IDLE_LOGIN_STATE, status: "error", error });
      return {};
    }
  }, []);

  const clearLoginError = useCallback(() => {
    setLoginState((prev) => (prev.error ? IDLE_LOGIN_STATE : prev));
  }, []);

  const logout = useCallback(async () => {
    const token = getAccessToken();
    if (token) {
      try {
        await apiFetch(`${SEEDS_URL}/tenant/logout`, {
          method: "POST",
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        if (error.status !== 401 && error.status !== 403) {
          throw error;
        }
        console.warn(
          "AuthProvider: logout request failed with",
          error.status,
          "— treating as already logged out"
        );
      }
    }

    clearAuth();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        provided: true,
        isAuthenticated,
        initializing: initStatus === "loading",
        login,
        loginState,
        clearLoginError,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx.provided) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
};
