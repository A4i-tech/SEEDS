import React from "react";
import "./css/Header.css";

const UserDropdown = ({ onProfileClick, onLogoutClick }) => {
  return (
    <div className="user-dropdown">
      <button className="dropdown-item" onClick={onProfileClick}>
        Profile
      </button>
      <button className="dropdown-item" onClick={onLogoutClick}>
        Logout
      </button>
    </div>
  );
};

export default UserDropdown;
