import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import axiosInstance, { initSession } from "../services/axiosInstance";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { setAccessToken, clearAccessToken } from "../utils/tokenStore";

const IDLE_LOGIN = { status: "idle", data: {}, error: "" };

const AuthContext = createContext({
  isAuthenticated: false,
  initializing: true,
  login: async () => false,
  loginState: IDLE_LOGIN,
  clearLoginError: () => {},
  logout: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const init = async () => {
      setIsAuthenticated(await initSession());
      setInitializing(false);
    };
    init();
  }, []);

  const [loginState, setLoginState] = useState(IDLE_LOGIN);
  const login = useCallback(async (phoneNumber, password) => {
    setLoginState({ ...IDLE_LOGIN, status: "loading" });
    try {
      const response = await axiosInstance.post(
        API_ENDPOINTS.LOGIN,
        { phone_number: phoneNumber, password },
        { withCredentials: true }
      );
      setAccessToken(response.data.token);
      setIsAuthenticated(true);
      setLoginState({ status: "ok", data: response.data, error: "" });
      return true;
    } catch (error) {
      setLoginState({ ...IDLE_LOGIN, status: "error", error });
      return false;
    }
  }, []);

  const clearLoginError = useCallback(() => {
    setLoginState((prev) => (prev.error ? IDLE_LOGIN : prev));
  }, []);

  const logout = useCallback(async () => {
    try {
      await axiosInstance.post(API_ENDPOINTS.LOGOUT, {}, { withCredentials: true });
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) {
        throw error;
      }
      console.warn(
        "AuthProvider: logout request failed with",
        error.status,
        "- treating as already logged out"
      );
    }

    clearAccessToken();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, initializing, login, loginState, clearLoginError, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => useContext(AuthContext);
