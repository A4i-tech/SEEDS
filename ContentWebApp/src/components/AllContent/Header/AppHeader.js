import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import UserDropdown from "./UserDropdown";
import "./css/Header.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/utilities.css";

const AppHeader = ({
  activeTab,
  onTabChange,
  currentUser,
  onLogout,
  showContent = true,
  showRegistration = true,
  showAnalytics = true,
}) => {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  const navigate = useNavigate();

  const handleProfileClick = () => {
    setShowUserDropdown(false);
    navigate("/profile");
  };

  const handleLogoutClick = async () => {
    setShowUserDropdown(false);
    setLogoutError(null);
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(error.message);
    }
  };

  return (
    <div className="header-card">
      <div className="header-top">
        <div className="header-text">
          <img className="seed-icon" src="/seeds-icon.png" alt="SEEDS" />
          <span>SEEDS</span>
        </div>
        <div className="action-group">
          {showContent && (
            <button
              className={`nav-link ${activeTab === "content" ? "active" : ""}`}
              onClick={() => onTabChange("content")}
            >
              Content
            </button>
          )}
          {showRegistration && (
            <button
              className={`nav-link ${activeTab === "registration" ? "active" : ""}`}
              onClick={() => onTabChange("registration")}
            >
              Registration
            </button>
          )}
          {showAnalytics && (
            <button
              className={`nav-link ${activeTab === "analytics" ? "active" : ""}`}
              onClick={() => onTabChange("analytics")}
            >
              Analytics
            </button>
          )}
        </div>
      </div>
      <div className="user-dropdown-container">
        <div className="user-info-wrapper" onClick={() => setShowUserDropdown(!showUserDropdown)}>
          <span className="welcome-text">Welcome, {currentUser}</span>
          <div className="user-avatar">{currentUser.substring(0, 2).toUpperCase()}</div>
        </div>
        {showUserDropdown && (
          <UserDropdown onProfileClick={handleProfileClick} onLogoutClick={handleLogoutClick} />
        )}
        {logoutError && (
          <span data-testid="logout-error" role="alert" className="logout-error">
            Logout failed: {logoutError}. You are still signed in — try again.
          </span>
        )}
      </div>
    </div>
  );
};

export default AppHeader;
