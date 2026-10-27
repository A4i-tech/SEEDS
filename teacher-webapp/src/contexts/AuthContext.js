import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import axiosInstance, { initSession } from "../services/axiosInstance";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { setAccessToken, clearAccessToken } from "../utils/tokenStore";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initState, setInitState] = useState({ data: null, error: null, isLoading: true });

  useEffect(() => {
    const init = async () => {
      const { data, error } = await initSession();
      if (error) {
        console.error("AuthContext: session init failed", error);
      }
      setIsAuthenticated(!!data);
      setInitState({ data, error, isLoading: false });
    };
    init();
  }, []);

  const [loginState, setLoginState] = useState({ data: null, error: null, isLoading: false });
  const login = useCallback(async (phoneNumber, password) => {
    setLoginState({ data: null, error: null, isLoading: true });
    try {
      const response = await axiosInstance.post(
        API_ENDPOINTS.LOGIN,
        { phone_number: phoneNumber, password },
        { withCredentials: true }
      );
      setAccessToken(response.data.token);
      setIsAuthenticated(true);
      setLoginState({ data: response.data, error: null, isLoading: false });
      return response.data;
    } catch (error) {
      setLoginState({ data: null, error, isLoading: false });
    }
  }, []);

  const clearLoginError = useCallback(() => {
    setLoginState((prev) => (prev.error ? { ...prev, error: null } : prev));
  }, []);

  const logout = useCallback(async () => {
    try {
      await axiosInstance.post(API_ENDPOINTS.LOGOUT, {}, { withCredentials: true });
    } catch (error) {
      const status = error.status ?? error.response?.status;
      if (status !== 401 && status !== 403) {
        throw error;
      }
    }

    clearAccessToken();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        initializing: initState.isLoading,
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
  if (!ctx) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return ctx;
};
