import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import UserDropdown from "./UserDropdown";
import "./css/Header.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/utilities.css";

const NAV_LINKS = [
  { key: "content", show: "showContent", label: "Content" },
  { key: "registration", show: "showRegistration", label: "Registration" },
  { key: "analytics", show: "showAnalytics", label: "Analytics" },
  { key: "localization", show: "showLocalization", label: "Localization" },
];

const AppHeader = ({
  activeTab,
  onTabChange,
  currentUser,
  onLogout,
  showContent = true,
  showRegistration = true,
  showAnalytics = true,
  showLocalization,
  showRemediation = true,
}) => {
  const visibility = { showContent, showRegistration, showAnalytics, showLocalization };
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
          {NAV_LINKS.map(
            ({ key, show, label }) =>
              visibility[show] && (
                <button
                  key={key}
                  className={`nav-link ${activeTab === key ? "active" : ""}`}
                  onClick={() => onTabChange(key)}
                >
                  {label}
                </button>
              )
          )}
          {showRemediation && (
            <button
              className={`nav-link ${activeTab === "remediation" ? "active" : ""}`}
              onClick={() => onTabChange("remediation")}
            >
              Textbooks
            </button>
          )}
        </div>
      </div>
      <div className="user-dropdown-container">
        <div className="user-info-wrapper" onClick={() => setShowUserDropdown(!showUserDropdown)}>
          <span className="welcome-text">Welcome, {currentUser}</span>
          <div className="user-avatar">
            {currentUser.substring(0, 2).toUpperCase()}
          </div>
        </div>

        {showUserDropdown && (
          <UserDropdown onProfileClick={handleProfileClick} onLogoutClick={handleLogoutClick} />
        )}
      </div>
    </div>
  );
};

export default AppHeader;
