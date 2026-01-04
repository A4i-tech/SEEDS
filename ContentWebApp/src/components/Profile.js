import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppHeader from "./AllContent/Header/AppHeader";
import { useAuth } from "../hooks/useAuth";
import { SEEDS_URL } from "../Constants";
import "./AllContent/AllContent.css";
import "./AllContent/shared/cards.css";
import "./AllContent/shared/buttons.css";
import "./AllContent/shared/utilities.css";
import "./Profile.css";

const Profile = () => {
  const navigate = useNavigate();
  const { getAuthHeaders, logout, getCurrentUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [currentUser, setCurrentUser] = useState("User");

  const handleTabChange = (tab) => {
    navigate("/content", { state: { activeTab: tab } });
  };

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${SEEDS_URL}/tenant/me`, {
        method: "GET",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else {
        console.error("Failed to fetch profile");
        setProfile(null);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const name = await getCurrentUser();
        setCurrentUser(name);
      } catch (error) {
        console.error("Error fetching user:", error);
        setCurrentUser("User");
      }
    };

    loadUser();
  }, [getCurrentUser]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!passwordData.currentPassword) {
      setPasswordError("Current password is required for security");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }

    if (passwordData.currentPassword === passwordData.newPassword) {
      setPasswordError("New password must be different from current password");
      return;
    }

    setIsChangingPassword(true);

    try {
      const response = await fetch(`${SEEDS_URL}/tenant/change-password`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      if (response.ok) {
        setPasswordSuccess("Password updated successfully!");
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setTimeout(() => setPasswordSuccess(""), 3000);
      } else {
        const errorData = await response.json();
        setPasswordError(
          errorData.message || "Failed to update password. Please verify your current password."
        );
      }
    } catch (error) {
      console.error("Error updating password:", error);
      setPasswordError("Failed to update password. Please try again.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="page profile-page">
      <div className="container profile-container">
        <AppHeader
          activeTab="profile"
          onTabChange={handleTabChange}
          currentUser={currentUser}
          onLogout={logout}
        />

        {loading ? (
          <div className="card loading-card">Loading profile...</div>
        ) : (
          <div className="profile-grid">
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Account Information</h2>
                  <p className="card-description">Your tenant details (read-only)</p>
                </div>
              </div>
              <div className="profile-fields">
                <div className="profile-field">
                  <label className="profile-label">Organization Name</label>
                  <input
                    className="profile-input profile-input-disabled"
                    type="text"
                    value={profile?.tenantName || ""}
                    disabled
                  />
                </div>
                <div className="profile-field">
                  <label className="profile-label">Email</label>
                  <input
                    className="profile-input profile-input-disabled"
                    type="email"
                    value={profile?.email || ""}
                    disabled
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Change Password</h2>
                  <p className="card-description">Update your account password</p>
                </div>
              </div>
              <form onSubmit={handlePasswordChange} className="profile-form">
                <div className="profile-field">
                  <label className="profile-label" htmlFor="current-password">
                    Current Password
                  </label>
                  <input
                    id="current-password"
                    className="profile-input"
                    type="password"
                    placeholder="Enter your current password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        currentPassword: e.target.value,
                      })
                    }
                    required
                  />
                  <p className="profile-hint">
                    For security, please verify your current password before changing it
                  </p>
                </div>
                <div className="profile-field">
                  <label className="profile-label" htmlFor="new-password">
                    New Password
                  </label>
                  <input
                    id="new-password"
                    className="profile-input"
                    type="password"
                    placeholder="Enter new password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        newPassword: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="profile-field">
                  <label className="profile-label" htmlFor="confirm-password">
                    Confirm Password
                  </label>
                  <input
                    id="confirm-password"
                    className="profile-input"
                    type="password"
                    placeholder="Confirm new password"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        confirmPassword: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                {passwordError && <div className="profile-error">{passwordError}</div>}
                {passwordSuccess && <div className="profile-success">{passwordSuccess}</div>}
                <div className="profile-actions">
                  <button type="submit" className="primary-button" disabled={isChangingPassword}>
                    {isChangingPassword ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
