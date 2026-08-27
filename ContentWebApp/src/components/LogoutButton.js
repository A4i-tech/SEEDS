import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../contexts/AuthContext";
import { clearAuth } from "../utils/authHelpers";

const LogoutButton = () => {
  const navigate = useNavigate();
  const { logout, logoutState } = useAuthContext();

  const handleLogout = async () => {
    const ok = await logout();
    clearAuth();
    sessionStorage.clear();
    if (!ok) return;
    navigate("/");
  };

  return (
    <button
      className="btn"
      style={{ backgroundColor: "#28574F", color: "white", float: "right" }}
      onClick={handleLogout}
      disabled={logoutState.isLoading}
    >
      Logout
    </button>
  );
};

export default LogoutButton;
