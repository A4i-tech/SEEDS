import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { setAuth } from "../utils/authHelpers";

const baseURL = process.env.REACT_APP_API_BASE_URL;

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#f4f6f8",
  padding: "24px",
};

const cardStyle = {
  width: "100%",
  maxWidth: "420px",
  backgroundColor: "#fff",
  borderRadius: "16px",
  boxShadow: "0 20px 45px rgba(15, 23, 42, 0.12)",
  padding: "32px",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
};

const headerStyle = {
  textAlign: "center",
};

const titleStyle = {
  fontSize: "28px",
  fontWeight: 700,
  marginBottom: "4px",
  color: "#0f172a",
};

const descriptionStyle = {
  fontSize: "14px",
  color: "#64748b",
};

const tabsStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  borderRadius: "999px",
  backgroundColor: "#f1f5f9",
  padding: "4px",
  gap: "4px",
};

const tabButtonStyle = (active) => ({
  border: "none",
  borderRadius: "999px",
  padding: "10px 0",
  fontSize: "14px",
  fontWeight: 600,
  cursor: active ? "default" : "pointer",
  backgroundColor: active ? "#0f172a" : "transparent",
  color: active ? "#fff" : "#475569",
  transition: "background-color 0.2s ease",
});

const labelStyle = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#fff",
  marginBottom: "6px",
};

const inputStyle = {
  width: "100%",
  borderRadius: "10px",
  border: "1px solid #e2e8f0",
  padding: "12px",
  fontSize: "15px",
  outline: "none",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
};

const buttonStyle = {
  width: "100%",
  border: "none",
  borderRadius: "10px",
  padding: "12px",
  fontSize: "15px",
  fontWeight: 600,
  backgroundColor: "#0f172a",
  color: "#fff",
  cursor: "pointer",
  transition: "opacity 0.2s ease",
};

const footerStyle = {
  textAlign: "center",
  fontSize: "13px",
  color: "#94a3b8",
};

const Login = () => {
  const navigate = useNavigate();
  const [showError, setShowError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [role, setRole] = useState("tenant");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setShowError("");

    if (!formData.email || !formData.password) {
      setShowError("Please fill in all fields.");
      return;
    }

    try {
      setIsSubmitting(true);

      const endpoint =
        role === "school_admin"
          ? `${baseURL}/school/admin/login`
          : `${baseURL}/tenant/login`;

      const response = await axios.post(endpoint, {
        email: formData.email,
        password: formData.password,
      });

      if (response.status === 200) {
        if (role === "school_admin") {
          const { token, schoolId, schoolName } = response.data;
          setAuth(token, "school_admin", schoolId);
          navigate("/content", { state: { name: schoolName } });
        } else {
          const { token, tenantName } = response.data;
          setAuth(token, "tenant");
          navigate("/content", { state: { name: tenantName } });
        }
      } else {
        setShowError("Invalid credentials. Please try again.");
      }
    } catch (error) {
      console.error("Login error:", error);
      setShowError("Login failed. Please verify your details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>SEEDS</h1>
          <p style={descriptionStyle}>Educational App for Visually Impaired Students</p>
        </header>

        <div style={tabsStyle}>
          <button type="button" style={tabButtonStyle(true)}>
            Login
          </button>
          <button type="button" style={tabButtonStyle(false)} onClick={() => navigate("/register")}>
            Sign Up
          </button>
        </div>

        <div style={tabsStyle}>
          <button type="button" style={tabButtonStyle(role === "tenant")} onClick={() => setRole("tenant")}>
            Tenant
          </button>
          <button type="button" style={tabButtonStyle(role === "school_admin")} onClick={() => setRole("school_admin")}>
            School Admin
          </button>
        </div>

        <form
          onSubmit={handleLogin}
          style={{ display: "flex", flexDirection: "column", gap: "18px" }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label htmlFor="login-email" style={labelStyle}>
              Email
            </label>
            <input
              id="login-email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange("email")}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <label htmlFor="login-password" style={labelStyle}>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange("password")}
              style={inputStyle}
            />
          </div>

          <button type="submit" style={buttonStyle} disabled={isSubmitting}>
            {isSubmitting ? "Logging in..." : "Login"}
          </button>
        </form>

        {showError && (
          <p
            style={{
              color: "#ef4444",
              textAlign: "center",
              fontSize: "14px",
              marginTop: "-8px",
            }}
          >
            {showError}
          </p>
        )}

        <footer style={footerStyle}>Accessible. Audio-First. Inclusive.</footer>
      </div>
    </div>
  );
};

export default Login;
