import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import UserDropdown from "./UserDropdown";
import "./Header.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/utilities.css";

const AppHeader = ({ activeTab, onTabChange, currentUser, onLogout }) => {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const navigate = useNavigate();

  const handleProfileClick = () => {
    setShowUserDropdown(false);
    navigate("/profile");
  };

  const handleLogoutClick = () => {
    setShowUserDropdown(false);
    onLogout();
  };

  return (
    <div className="header-card">
      <div className="header-top">
        <div className="header-text">
          <img className="seed-icon" src="/seeds-icon.png" alt="SEEDS" />
          <span>SEEDS</span>
        </div>
        <div className="action-group">
          <button
            className={`nav-link ${activeTab === "content" ? "active" : ""}`}
            onClick={() => onTabChange("content")}
          >
            Content
          </button>
          <button
            className={`nav-link ${
              activeTab === "registration" ? "active" : ""
            }`}
            onClick={() => onTabChange("registration")}
          >
            Registration
          </button>
          <button
            className={`nav-link ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => onTabChange("analytics")}
          >
            Analytics
          </button>
        </div>
      </div>
      <div className="user-dropdown-container">
        <div
          className="user-info-wrapper"
          onClick={() => setShowUserDropdown(!showUserDropdown)}
        >
          <span className="welcome-text">Welcome, {currentUser}</span>
          <div className="user-avatar">
            {currentUser.substring(0, 2).toUpperCase()}
          </div>
        </div>
        {showUserDropdown && (
          <UserDropdown
            onProfileClick={handleProfileClick}
            onLogoutClick={handleLogoutClick}
          />
        )}
      </div>
    </div>
  );
};

export default AppHeader;
