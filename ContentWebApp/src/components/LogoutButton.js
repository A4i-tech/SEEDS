import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../contexts/AuthContext";
import { clearAuth } from "../utils/authHelpers";

const LogoutButton = () => {
  const navigate = useNavigate();
  const { logout } = useAuthContext();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearAuth();
      sessionStorage.clear();
      navigate("/");
    }
  };

  return (
    <button
      className="btn"
      style={{ backgroundColor: "#28574F", color: "white", float: "right" }}
      onClick={handleLogout}
    >
      Logout
    </button>
  );
};

export default LogoutButton;
