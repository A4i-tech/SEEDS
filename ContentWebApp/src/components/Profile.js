import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SEEDS_URL } from "../Constants";

const pageStyle = {
  minHeight: "100vh",
  backgroundColor: "#f4f6f8",
  padding: "32px 24px",
};

const containerStyle = {
  maxWidth: "800px",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "8px",
};

const iconStyle = {
  width: "32px",
  height: "32px",
  color: "#1d4ed8",
};

const titleStyle = {
  fontSize: "32px",
  fontWeight: 700,
  color: "#0f172a",
  margin: 0,
};

const subtitleStyle = {
  fontSize: "15px",
  color: "#64748b",
  marginTop: "4px",
};

const cardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "16px",
  padding: "24px",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
};

const cardHeaderStyle = {
  marginBottom: "20px",
};

const cardTitleStyle = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#0f172a",
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const cardDescriptionStyle = {
  fontSize: "14px",
  color: "#64748b",
  marginTop: "4px",
};

const formStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const labelStyle = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#0f172a",
  marginBottom: "6px",
  display: "block",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  fontSize: "14px",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  color: "#0f172a",
  backgroundColor: "#ffffff",
};

const inputDisabledStyle = {
  ...inputStyle,
  backgroundColor: "#f8fafc",
  color: "#94a3b8",
  cursor: "not-allowed",
};

const buttonStyle = {
  padding: "10px 20px",
  fontSize: "14px",
  fontWeight: 600,
  color: "#ffffff",
  backgroundColor: "#0f172a",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "background-color 0.2s",
};

const buttonDisabledStyle = {
  ...buttonStyle,
  backgroundColor: "#94a3b8",
  cursor: "not-allowed",
};

const backButtonStyle = {
  padding: "10px 20px",
  fontSize: "14px",
  fontWeight: 600,
  color: "#0f172a",
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "background-color 0.2s",
};

const errorStyle = {
  fontSize: "13px",
  color: "#ef4444",
  marginTop: "4px",
};

const successStyle = {
  fontSize: "13px",
  color: "#16a34a",
  marginTop: "4px",
};

const Profile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const getAuthHeaders = () => {
    const token = localStorage.getItem("authToken");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      navigate("/");
      return;
    }
    fetchProfile();
  }, [navigate]);

  const fetchProfile = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId");
      const response = await fetch(`${SEEDS_URL}/tenant/${tenantId}`, {
        method: "GET",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else {
        console.error("Failed to fetch profile");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    // Validation
    if (passwordData.newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError("Passwords don't match");
      return;
    }

    setIsChangingPassword(true);

    try {
      const tenantId = localStorage.getItem("tenantId");
      const response = await fetch(`${SEEDS_URL}/tenant/change-password`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tenantId: tenantId,
          newPassword: passwordData.newPassword,
        }),
      });

      if (response.ok) {
        setPasswordSuccess("Password updated successfully!");
        setPasswordData({ newPassword: "", confirmPassword: "" });
        setTimeout(() => setPasswordSuccess(""), 3000);
      } else {
        const errorData = await response.json();
        setPasswordError(errorData.message || "Failed to update password");
      }
    } catch (error) {
      console.error("Error updating password:", error);
      setPasswordError("Failed to update password. Please try again.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <div
            style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}
          >
            Loading profile...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div>
          <div style={headerStyle}>
            <svg
              style={iconStyle}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <div>
              <h1 style={titleStyle}>Profile Settings</h1>
            </div>
          </div>
          <p style={subtitleStyle}>Manage your account information</p>
        </div>

        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h2 style={cardTitleStyle}>Account Information</h2>
            <p style={cardDescriptionStyle}>Your tenant details (read-only)</p>
          </div>
          <div style={formStyle}>
            <div>
              <label style={labelStyle}>Organization Name</label>
              <input
                style={inputDisabledStyle}
                type="text"
                value={profile?.name || ""}
                disabled
              />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                style={inputDisabledStyle}
                type="email"
                value={profile?.email || ""}
                disabled
              />
            </div>
            {profile?.phone && (
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  style={inputDisabledStyle}
                  type="tel"
                  value={profile.phone}
                  disabled
                />
              </div>
            )}
            {profile?.address && (
              <div>
                <label style={labelStyle}>Address</label>
                <input
                  style={inputDisabledStyle}
                  type="text"
                  value={profile.address}
                  disabled
                />
              </div>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h2 style={cardTitleStyle}>
              <svg
                style={{ width: "20px", height: "20px" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Change Password
            </h2>
            <p style={cardDescriptionStyle}>Update your account password</p>
          </div>
          <form onSubmit={handlePasswordChange} style={formStyle}>
            <div>
              <label style={labelStyle} htmlFor="new-password">
                New Password
              </label>
              <input
                id="new-password"
                style={inputStyle}
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
            <div>
              <label style={labelStyle} htmlFor="confirm-password">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                style={inputStyle}
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
            {passwordError && <div style={errorStyle}>{passwordError}</div>}
            {passwordSuccess && (
              <div style={successStyle}>{passwordSuccess}</div>
            )}
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                type="submit"
                style={isChangingPassword ? buttonDisabledStyle : buttonStyle}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? "Updating..." : "Update Password"}
              </button>
              <button
                type="button"
                style={backButtonStyle}
                onClick={() => navigate("/content")}
              >
                Back to Dashboard
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;
