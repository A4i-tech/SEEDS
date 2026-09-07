import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SEEDS_URL } from "../Constants";
import { apiFetch, initSession } from "../services/api";
import { setAccessToken, getAccessToken } from "../utils/tokenStore";
import { clearAuth } from "../utils/authHelpers";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initState, setInitState] = useState({ data: null, error: null, isLoading: true });

  useEffect(() => {
    const init = async () => {
      const { data, error } = await initSession();
      setIsAuthenticated(!!data);
      setInitState({ data, error, isLoading: false });
    };
    init();
  }, []);

  const [loginState, setLoginState] = useState({ data: null, error: null, isLoading: false });
  const login = useCallback(async (body) => {
    setLoginState({ data: null, error: null, isLoading: true });
    try {
      const data = await apiFetch(`${SEEDS_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      setAccessToken(data.token);
      setIsAuthenticated(true);
      setLoginState({ data, error: null, isLoading: false });
      return data;
    } catch (error) {
      setLoginState({ data: null, error, isLoading: false });
    }
  }, []);

  const logout = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      throw new Error("logout called with no access token in memory");
    }

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
    }

    clearAuth();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        initializing: initState.isLoading,
        initError: initState.error,
        login,
        loginState,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
};
