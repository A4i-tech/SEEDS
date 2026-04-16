import React, { useState } from "react";
import "./css/TeacherRegistrationForm.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/utilities.css";
import { PhoneNumberInput } from "../shared/PhoneNumberInput";

const TEAM_ICON_PATH = "/icons/team.svg";
const ROLE_ICON_PATH = "/icons/role.svg";
const USER_ICON_PATH = "/icons/user.svg";
const PHONE_ICON_PATH = "/icons/phone.svg";
const LOCK_ICON_PATH = "/icons/lock.svg";
const EYE_OPEN_ICON_PATH = "/icons/eye-open.svg";
const EYE_CLOSED_ICON_PATH = "/icons/eye-closed.svg";

const TeacherRegistrationForm = ({
  onRegisterUser,
  message,
  role,
  onRoleChange,
}) => {
  const [name, setName] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    const success = await onRegisterUser({
      role,
      phoneNumber: contactValue,
      password,
      name,
    });

    if (success) {
      setName("");
      setContactValue("");
      setPassword("");
    }
  };

  return (
    <div className="registration-card registration-card-modern">
      <div className="registration-header-block">
        <h3 className="registration-title registration-title-with-icon">
          <span className="registration-title-icon" aria-hidden="true">
            <img src={TEAM_ICON_PATH} alt="" aria-hidden="true" />
          </span>
          Register User
        </h3>
        <p className="registration-subtitle">
          Create teacher and content creator accounts for this tenant.
        </p>
      </div>

      <div className="registration-fields-grid">
        <div className="registration-field">
          <label className="label" htmlFor="user-role">
            Role
          </label>
          <div className="registration-input-wrap registration-select-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <img src={ROLE_ICON_PATH} alt="" aria-hidden="true" />
            </span>
            <select
              id="user-role"
              className="input-field registration-select registration-input-with-icon"
              value={role}
              onChange={(e) => onRoleChange(e.target.value)}
            >
              <option value="teacher">Teacher</option>
              <option value="content_creator">Content Creator</option>
            </select>
          </div>
        </div>

        <div className="registration-field">
          <label className="label" htmlFor="user-name">
            Full Name
          </label>
          <div className="registration-input-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <img src={USER_ICON_PATH} alt="" aria-hidden="true" />
            </span>
            <input
              id="user-name"
              type="text"
              placeholder="Enter full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field registration-input-with-icon"
              required
            />
          </div>
        </div>

        <div className="registration-field">
          <label className="label" htmlFor="user-contact">
            Phone Number
          </label>
          <div className="registration-input-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <img src={PHONE_ICON_PATH} alt="" aria-hidden="true" />
            </span>
            {/* Shared phone input keeps registration and add-student validation behavior identical. */}
            <PhoneNumberInput
              id="user-contact"
              placeholder="Enter phone number"
              value={contactValue}
              onChange={setContactValue}
              className="input-field registration-input-with-icon"
            />
          </div>
          <p className="registration-hint">
            Use a valid 10-digit mobile number.
          </p>
        </div>

        <div className="registration-field">
          <label className="label" htmlFor="user-password">
            Password
          </label>
          <div className="registration-input-wrap registration-password-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <img src={LOCK_ICON_PATH} alt="" aria-hidden="true" />
            </span>
            <input
              id="user-password"
              type={showPassword ? "text" : "password"}
              placeholder="Set a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field registration-input-with-icon registration-password-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              className="registration-password-toggle"
            >
              <img
                src={showPassword ? EYE_CLOSED_ICON_PATH : EYE_OPEN_ICON_PATH}
                alt=""
                aria-hidden="true"
                className="registration-password-toggle-icon"
              />
            </button>
          </div>
        </div>
      </div>

      <div className="registration-cta-row">
        <button type="button" className="primary-button full-width-button" onClick={handleSubmit}>
          Add User
        </button>
      </div>

      {message && <p className="success-message">{message}</p>}
    </div>
  );
};

export default TeacherRegistrationForm;
