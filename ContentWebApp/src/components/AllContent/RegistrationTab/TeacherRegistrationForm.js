import React, { useState } from "react";
import "./css/TeacherRegistrationForm.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/utilities.css";

const TeacherRegistrationForm = ({
  onRegisterTeacher,
  onRegisterContentCreator,
  teacherMessage,
  creatorMessage,
  role,
  onRoleChange,
}) => {
  const [name, setName] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [password, setPassword] = useState("");

  const activeMessage = role === "content_creator" ? creatorMessage : teacherMessage;

  const handleSubmit = async () => {
    const success =
      role === "content_creator"
        ? await onRegisterContentCreator({
            name,
            email: contactValue,
            password,
          })
        : await onRegisterTeacher(contactValue, password, name);

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
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 1c1.66 0 3-1.34 3-3S9.66 6 8 6 5 7.34 5 9s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-2.5C15 15.17 10.33 14 8 14zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.98 1.97 3.45V20h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
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
          <div className="registration-input-wrap">
            <select
              id="user-role"
              className="input-field registration-select"
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
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 12c2.76 0 5-2.24 5-5S14.76 2 12 2 7 4.24 7 7s2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z" />
              </svg>
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
            Contact Info
          </label>
          <div className="registration-input-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              {role === "content_creator" ? (
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M6.62 10.79a15.46 15.46 0 006.59 6.59l2.2-2.2a1 1 0 01.95-.27 11.72 11.72 0 003.68.59 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.72 11.72 0 00.59 3.68 1 1 0 01-.27.95z" />
                </svg>
              )}
            </span>
            <input
              id="user-contact"
              type={role === "content_creator" ? "email" : "tel"}
              placeholder={role === "content_creator" ? "Enter email address" : "Enter phone number"}
              value={contactValue}
              onChange={(e) => {
                if (role === "content_creator") {
                  setContactValue(e.target.value);
                  return;
                }

                const value = e.target.value.replace(/\D/g, "");
                if (value.length <= 10) {
                  setContactValue(value);
                }
              }}
              maxLength={role === "content_creator" ? undefined : 10}
              className="input-field registration-input-with-icon"
            />
          </div>
          <p className="registration-hint">
            {role === "content_creator"
              ? "Use a valid email for sign in."
              : "Use a valid 10-digit mobile number."}
          </p>
        </div>

        <div className="registration-field registration-field-full">
          <label className="label" htmlFor="user-password">
            Password
          </label>
          <div className="registration-input-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 116 0v3H9z" />
              </svg>
            </span>
            <input
              id="user-password"
              type="password"
              placeholder="Set a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field registration-input-with-icon"
            />
          </div>
        </div>
      </div>

      <div className="registration-cta-row">
        <button type="button" className="primary-button full-width-button" onClick={handleSubmit}>
          Add {role === "content_creator" ? "Content Creator" : "Teacher"}
        </button>
      </div>

      {activeMessage && <p className="success-message">{activeMessage}</p>}
    </div>
  );
};

export default TeacherRegistrationForm;
