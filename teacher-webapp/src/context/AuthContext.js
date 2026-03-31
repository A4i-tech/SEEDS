import React, { createContext, useContext, useState, useMemo } from "react";
import { isAuthenticated } from "../utils/authHelpers";

const AuthContext = createContext({ isLoggedIn: false, setLoggedIn: () => {} });

export function AuthProvider({ children }) {
  const [isLoggedIn, setLoggedIn] = useState(isAuthenticated());

  const value = useMemo(() => ({ isLoggedIn, setLoggedIn }), [isLoggedIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthState() {
  return useContext(AuthContext);
}
