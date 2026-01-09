import React from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { getAuthHeaders } from "../utils/authHelpers";

// Define your API's base URL
const baseURL = process.env.REACT_APP_API_BASE_URL;

const LogoutButton = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("authToken");

      if (token) {
        await axios.post(
          `${baseURL}/tenant/logout`,
          {},
          {
            headers: getAuthHeaders(),
          }
        );
        console.log("Successfully logged out on server.");
      }
    } catch (error) {
      // Log the error for debugging, but don't block the user from logging out
      console.error("Server logout failed:", error);
    } finally {
      // Clear all local and session storage
      localStorage.clear();
      sessionStorage.clear();

      // Navigate to the login page
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
