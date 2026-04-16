import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import validator from "validator";
import { isValidPhoneNumber, sanitizePhoneInput } from "../utils/phoneUtils";
import "./Login.css";

const baseURL = process.env.REACT_APP_API_BASE_URL;
const EYE_OPEN_ICON_PATH = "/icons/eye-open.svg";
const EYE_CLOSED_ICON_PATH = "/icons/eye-closed.svg";
const INVALID_CREDENTIALS_MESSAGE = "Invalid credentials. Please try again.";

const getLoginPayload = (identifier, password) => {
  const value = identifier.trim();
  if (!value) {
    return { type: "empty" };
  }

  if (value.includes("@")) {
    if (!validator.isEmail(value)) {
      return { type: "invalid_email" };
    }

    return {
      type: "email",
      endpoint: "/tenant/login",
      payload: { email: value.toLowerCase(), password },
    };
  }

  const phoneNumber = sanitizePhoneInput(value);
  if (!isValidPhoneNumber(phoneNumber)) {
    return { type: "invalid_phone" };
  }

  return {
    type: "phone",
    endpoint: "/teacher/login",
    payload: { phoneNumber, password },
  };
};

const Login = () => {
  const navigate = useNavigate();
  const [showError, setShowError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
  });

  const handleChange = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setShowError("");

    if (!formData.identifier || !formData.password) {
      setShowError("Please fill in all fields.");
      return;
    }

    const identifier = formData.identifier.trim();
    const requestConfig = getLoginPayload(identifier, formData.password);
    if (requestConfig.type === "empty") {
      setShowError("Email or phone number is required.");
      return;
    }
    if (requestConfig.type === "invalid_email") {
      setShowError("Please enter a valid email address.");
      return;
    }
    if (requestConfig.type === "invalid_phone") {
      setShowError("Enter a valid 10-digit mobile number.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await axios.post(
        `${baseURL}${requestConfig.endpoint}`,
        requestConfig.payload
      );

      if (response.status !== 200) {
        setShowError(INVALID_CREDENTIALS_MESSAGE);
        return;
      }

      const { tenantName, token } = response.data;
      localStorage.setItem("authToken", token);
      navigate("/content", { state: { name: tenantName } });
    } catch (error) {
      console.error("Login error:", error);
      setShowError(INVALID_CREDENTIALS_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <header className="login-header">
          <h1 className="login-title">SEEDS</h1>
          <p className="login-description">
            Sign in with your registered email or mobile number and password.
          </p>
        </header>

        <div className="login-tabs">
          <button type="button" className="login-tab login-tab-active">
            Login
          </button>
          <button
            type="button"
            className="login-tab"
            onClick={() => navigate("/register")}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="login-field">
            <label htmlFor="login-identifier" className="login-label">
              Email / Mobile Number
            </label>
            <input
              id="login-identifier"
              type="text"
              placeholder="Enter email or mobile number"
              value={formData.identifier}
              onChange={handleChange("identifier")}
              className="login-input"
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password" className="login-label">
              Password
            </label>
            <div className="login-password-wrap">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange("password")}
                className="login-input login-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="login-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                <img
                  src={showPassword ? EYE_CLOSED_ICON_PATH : EYE_OPEN_ICON_PATH}
                  alt=""
                  aria-hidden="true"
                  className="login-eye-icon"
                />
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit" disabled={isSubmitting}>
            {isSubmitting ? "Logging in..." : "Login"}
          </button>
        </form>

        {showError && <p className="login-error">{showError}</p>}

        <footer className="login-footer">Accessible. Audio-First. Inclusive.</footer>
      </div>
    </div>
  );
};

export default Login;
