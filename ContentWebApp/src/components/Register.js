import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { SEEDS_URL } from "../Constants";

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
  color: "#0f172a",
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

const passwordHintsContainerStyle = {
  marginTop: "8px",
  fontSize: "12px",
  color: "#94a3b8",
};

const passwordHintsListStyle = {
  margin: "4px 0 0",
  paddingLeft: "18px",
};

const passwordHintItemStyle = (isValid) => ({
  margin: "2px 0",
  color: isValid ? "#16a34a" : "#94a3b8",
});

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

const PASSWORD_POLICY = {
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
};

const getPasswordPolicyStatus = (password) => {
  const length = password.length >= PASSWORD_POLICY.minLength;
  const lower = (password.match(/[a-z]/g) || []).length >= PASSWORD_POLICY.minLowercase;
  const upper = (password.match(/[A-Z]/g) || []).length >= PASSWORD_POLICY.minUppercase;
  const numbers = (password.match(/[0-9]/g) || []).length >= PASSWORD_POLICY.minNumbers;
  const symbols = (password.match(/[^A-Za-z0-9]/g) || []).length >= PASSWORD_POLICY.minSymbols;

  const isValid = length && lower && upper && numbers && symbols;

  return { length, lower, upper, numbers, symbols, isValid };
};

const isValidEmail = (email) => {
  if (!email) return false;
  // Basic, user-friendly email pattern; backend still has final say
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

const Register = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        tenantName: "",
        email: "",
        password: "",
        confirmPassword: "",
    });
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const passwordStatus = getPasswordPolicyStatus(formData.password || "");
    const emailIsValid = formData.email ? isValidEmail(formData.email) : null; // null = untouched/empty

    const handleChange = (field) => (event) => {
        setFormData((prev) => ({ ...prev, [field]: event.target.value }));
    };

    const handleRegister = async (event) => {
        event.preventDefault();
        setError("");

        if (!formData.email || !formData.password || !formData.tenantName || !formData.confirmPassword) {
            setError("All fields are required.");
            return;
        }

        if (!isValidEmail(formData.email)) {
            setError("Please enter a valid email address.");
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        if (!passwordStatus.isValid) {
            setError("Password does not meet the minimum security requirements below.");
            return;
        }

        try {
            setIsSubmitting(true);
            const response = await axios.post(`${SEEDS_URL}/tenant/register`, {
                email: formData.email,
                password: formData.password,
                tenantName: formData.tenantName,
            });

            if (response.status === 201) {
                navigate("/");
            }
        } catch (err) {
            console.error("Registration error:", err);
            setError("Failed to register. Please try again.");
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
                    <button
                        type="button"
                        style={tabButtonStyle(false)}
                        onClick={() => navigate("/")}
                    >
                        Login
                    </button>
                    <button type="button" style={tabButtonStyle(true)}>
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <label htmlFor="tenantName" style={labelStyle}>
                            Tenant Name
                        </label>
                        <input
                            id="tenantName"
                            type="text"
                            placeholder="Enter your tenant name"
                            value={formData.tenantName}
                            onChange={handleChange("tenantName")}
                            style={inputStyle}
                        />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <label htmlFor="email" style={labelStyle}>
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            placeholder="Enter your email"
                            value={formData.email}
                            onChange={handleChange("email")}
                            style={{
                                ...inputStyle,
                                borderColor:
                                    emailIsValid === null
                                        ? "#e2e8f0"
                                        : emailIsValid
                                        ? "#16a34a"
                                        : "#ef4444",
                            }}
                        />
                        {formData.email && (
                            <span
                                style={{
                                    marginTop: "4px",
                                    fontSize: "12px",
                                    color: emailIsValid ? "#16a34a" : "#ef4444",
                                }}
                            >
                                {emailIsValid
                                    ? "Looks like a valid email."
                                    : "Please enter a valid email address (e.g. name@example.com)."}
                            </span>
                        )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <label htmlFor="password" style={labelStyle}>
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            placeholder="Enter your password"
                            value={formData.password}
                            onChange={handleChange("password")}
                            style={inputStyle}
                        />
                        <div style={passwordHintsContainerStyle}>
                            <span>Password must include:</span>
                            <ul style={passwordHintsListStyle}>
                                <li style={passwordHintItemStyle(passwordStatus.length)}>
                                    At least {PASSWORD_POLICY.minLength} characters
                                </li>
                                <li style={passwordHintItemStyle(passwordStatus.lower)}>
                                    At least {PASSWORD_POLICY.minLowercase} lowercase letter
                                </li>
                                <li style={passwordHintItemStyle(passwordStatus.upper)}>
                                    At least {PASSWORD_POLICY.minUppercase} uppercase letter
                                </li>
                                <li style={passwordHintItemStyle(passwordStatus.numbers)}>
                                    At least {PASSWORD_POLICY.minNumbers} number
                                </li>
                                <li style={passwordHintItemStyle(passwordStatus.symbols)}>
                                    At least {PASSWORD_POLICY.minSymbols} symbol (e.g. !@#$)
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <label htmlFor="confirm-password" style={labelStyle}>
                            Confirm Password
                        </label>
                        <input
                            id="confirm-password"
                            type="password"
                            placeholder="Confirm your password"
                            value={formData.confirmPassword}
                            onChange={handleChange("confirmPassword")}
                            style={inputStyle}
                        />
                    </div>

                    <button type="submit" style={buttonStyle} disabled={isSubmitting}>
                        {isSubmitting ? "Creating account..." : "Sign Up"}
                    </button>
                </form>

                {error && (
                    <p style={{ color: "#ef4444", textAlign: "center", fontSize: "14px", marginTop: "-8px" }}>
                        {error}
                    </p>
                )}

                <footer style={footerStyle}>Accessible. Audio-First. Inclusive.</footer>
            </div>
        </div>

        <form
          onSubmit={handleRegister}
          style={{ display: "flex", flexDirection: "column", gap: "18px" }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label htmlFor="tenantName" style={labelStyle}>
              Tenant Name
            </label>
            <input
              id="tenantName"
              type="text"
              placeholder="Enter your tenant name"
              value={formData.tenantName}
              onChange={handleChange("tenantName")}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <label htmlFor="email" style={labelStyle}>
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange("email")}
              style={{
                ...inputStyle,
                borderColor:
                  emailIsValid === null ? "#e2e8f0" : emailIsValid ? "#16a34a" : "#ef4444",
              }}
            />
            {formData.email && (
              <span
                style={{
                  marginTop: "4px",
                  fontSize: "12px",
                  color: emailIsValid ? "#16a34a" : "#ef4444",
                }}
              >
                {emailIsValid
                  ? "Looks like a valid email."
                  : "Please enter a valid email address (e.g. name@example.com)."}
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <label htmlFor="password" style={labelStyle}>
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange("password")}
              style={inputStyle}
            />
            <div style={passwordHintsContainerStyle}>
              <span>Password must include:</span>
              <ul style={passwordHintsListStyle}>
                <li style={passwordHintItemStyle(passwordStatus.length)}>
                  At least {PASSWORD_POLICY.minLength} characters
                </li>
                <li style={passwordHintItemStyle(passwordStatus.lower)}>
                  At least {PASSWORD_POLICY.minLowercase} lowercase letter
                </li>
                <li style={passwordHintItemStyle(passwordStatus.upper)}>
                  At least {PASSWORD_POLICY.minUppercase} uppercase letter
                </li>
                <li style={passwordHintItemStyle(passwordStatus.numbers)}>
                  At least {PASSWORD_POLICY.minNumbers} number
                </li>
                <li style={passwordHintItemStyle(passwordStatus.symbols)}>
                  At least {PASSWORD_POLICY.minSymbols} symbol (e.g. !@#$)
                </li>
              </ul>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <label htmlFor="confirm-password" style={labelStyle}>
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              placeholder="Confirm your password"
              value={formData.confirmPassword}
              onChange={handleChange("confirmPassword")}
              style={inputStyle}
            />
          </div>

          <button type="submit" style={buttonStyle} disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        {error && (
          <p style={{ color: "#ef4444", textAlign: "center", fontSize: "14px", marginTop: "-8px" }}>
            {error}
          </p>
        )}

        <footer style={footerStyle}>Accessible. Audio-First. Inclusive.</footer>
      </div>
    </div>
  );
};

export default Register;
