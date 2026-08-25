import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SEEDS_URL } from "../Constants";
import { apiFetch, refreshAccessToken } from "../services/api";
import { setAccessToken, getAccessToken, clearAccessToken } from "../utils/tokenStore";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const refresh = async () => {
      try {
        await refreshAccessToken();
        setIsAuthenticated(true);
      } catch (_error) {
        clearAccessToken();
        setIsAuthenticated(false);
      } finally {
        setInitializing(false);
      }
    };
    refresh();
  }, []);

  const login = useCallback(async (body) => {
    const data = await apiFetch(`${SEEDS_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    setAccessToken(data.token);
    setIsAuthenticated(true);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getAccessToken()) {
        await apiFetch(`${SEEDS_URL}/tenant/logout`, {
          method: "POST",
          credentials: "include",
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
      // Best-effort server revoke; client state is cleared regardless.
    } finally {
      clearAccessToken();
      setIsAuthenticated(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, initializing, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
};
