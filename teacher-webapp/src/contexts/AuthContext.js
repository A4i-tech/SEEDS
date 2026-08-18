import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import axiosInstance from "../services/axiosInstance";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { getAccessToken, setAccessToken, clearAccessToken } from "../utils/tokenStore";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const response = await axios.post(API_ENDPOINTS.REFRESH, {}, { withCredentials: true });
        setAccessToken(response.data.access_token);
        setIsAuthenticated(true);
      } catch (_error) {
        clearAccessToken();
        setIsAuthenticated(false);
      } finally {
        setInitializing(false);
      }
    };
    initAuth();
  }, []);

  const login = useCallback(async (phoneNumber, password) => {
    const response = await axiosInstance.post(
      API_ENDPOINTS.LOGIN,
      { phone_number: phoneNumber, password },
      { withCredentials: true }
    );
    setAccessToken(response.data.token);
    setIsAuthenticated(true);
    return response.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getAccessToken()) {
        await axiosInstance.post(API_ENDPOINTS.LOGOUT, {}, { withCredentials: true });
      }
    } catch (_error) {
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
  if (!ctx) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return ctx;
};
