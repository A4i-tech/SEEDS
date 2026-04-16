import React, { useState } from "react";
import {
  FaEye,
  FaEyeSlash,
  FaLock,
  FaPhoneAlt,
  FaUser,
  FaUsers,
} from "react-icons/fa";
import "./css/TeacherRegistrationForm.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/utilities.css";
import { PhoneNumberInput } from "../shared/PhoneNumberInput";

const TeacherRegistrationForm = ({ onRegister, message, messageType }) => {
  const [teacherPhone, setTeacherPhone] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherRole, setTeacherRole] = useState("teacher");
  const [submitError, setSubmitError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const isError = Boolean(submitError) || messageType === "error";

  const handleSubmit = async () => {
    const success = await onRegister(teacherPhone, teacherPassword, teacherName, teacherRole);
    if (success) {
      setTeacherPhone("");
      setTeacherPassword("");
      setTeacherName("");
      setTeacherRole("teacher");
      setSubmitError("");
    }
  };

  return (
    <div className="registration-card registration-card-modern">
      <div className="registration-header-block">
        <h3 className="registration-title registration-title-with-icon">
          <span className="registration-title-icon" aria-hidden="true">
            <FaUsers />
          </span>
          Register User
        </h3>
        <p className="registration-subtitle">
          Create teacher and content creator accounts for this tenant.
        </p>
      </div>

      <div className="registration-fields-grid">
        <div className="registration-field">
          <label className="label" htmlFor="teacher-role">Role</label>
          <div className="registration-input-wrap registration-select-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <FaUser />
            </span>
            <select
              id="teacher-role"
              value={teacherRole}
              onChange={(e) => setTeacherRole(e.target.value)}
              className="input-field registration-select registration-input-with-icon"
            >
              <option value="teacher">Teacher</option>
              <option value="content_creator">Content Creator</option>
            </select>
          </div>
        </div>

        <div className="registration-field">
          <label className="label" htmlFor="teacher-name">Full Name</label>
          <div className="registration-input-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <FaUser />
            </span>
            <input
              id="teacher-name"
              type="text"
              placeholder="Enter full name"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              className="input-field registration-input-with-icon"
              required
            />
          </div>
        </div>

        <div className="registration-field">
          <label className="label" htmlFor="teacher-phone">
            Phone Number
          </label>
          <div className="registration-input-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <FaPhoneAlt />
            </span>
            <PhoneNumberInput
              id="teacher-phone"
              placeholder="Enter phone number"
              value={teacherPhone}
              onChange={setTeacherPhone}
              className="input-field registration-input-with-icon"
            />
          </div>
          <p className="registration-hint">Use a valid 10-digit mobile number.</p>
        </div>

        <div className="registration-field">
          <label className="label" htmlFor="teacher-password">
            Password
          </label>
          <div className="registration-input-wrap registration-password-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <FaLock />
            </span>
            <input
              id="teacher-password"
              type={showPassword ? "text" : "password"}
              placeholder="Set a password"
              value={teacherPassword}
              onChange={(e) => setTeacherPassword(e.target.value)}
              className="input-field registration-input-with-icon registration-password-input"
            />
            <button
              type="button"
              className="registration-password-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
        </div>
      </div>

      <button type="button" className="primary-button full-width-button" onClick={handleSubmit}>
        Add User
      </button>

      {(submitError || message) && (
        <p className={isError ? "error-message" : "success-message"}>
          {submitError || message}
        </p>
      )}
    </div>
  );
};

export default TeacherRegistrationForm;
