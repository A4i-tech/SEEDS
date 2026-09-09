import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SEEDS_URL } from "../Constants";
import { apiFetch, initSession } from "../services/api";
import { setAccessToken, getAccessToken, clearAccessToken } from "../utils/tokenStore";

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

  const [logoutState, setLogoutState] = useState({ data: null, error: null, isLoading: false });
  const logout = useCallback(async () => {
    setLogoutState({ data: null, error: null, isLoading: true });
    try {
      if (getAccessToken()) {
        await apiFetch(`${SEEDS_URL}/tenant/logout`, {
          method: "POST",
          credentials: "include",
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        });
      }
      setLogoutState({ data: true, error: null, isLoading: false });
      return true;
    } catch (error) {
      setLogoutState({ data: null, error, isLoading: false });
      // Best-effort server revoke; client state is cleared regardless.
    } finally {
      clearAccessToken();
      setIsAuthenticated(false);
    }
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
        logoutState,
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
