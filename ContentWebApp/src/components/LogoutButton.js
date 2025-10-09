import React from 'react';
import { useNavigate } from 'react-router-dom';

const LogoutButton = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    // Clear any local storage or session data if needed
    localStorage.clear();
    sessionStorage.clear();

    // Navigate to login page
    navigate('/');
  };

  return (
    <button className="btn"
      style={{ backgroundColor: "#28574F", color: "white", float: 'right' }} onClick={handleLogout}>
      Logout
    </button>
  );
};

export default LogoutButton;
