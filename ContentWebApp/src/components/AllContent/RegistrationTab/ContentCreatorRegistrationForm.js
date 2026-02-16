import React, { useState } from "react";
import "./css/ContentCreatorRegistrationForm.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/utilities.css";

const ContentCreatorRegistrationForm = ({ onRegister, message }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async () => {
    const success = await onRegister({ name, email, password });
    if (success) {
      setName("");
      setEmail("");
      setPassword("");
    }
  };

  return (
    <div className="registration-card registration-card-modern">
      <div className="registration-header-block">
        <h3 className="registration-title registration-title-with-icon">
          <span className="registration-title-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 12c2.21 0 4-1.79 4-4S14.21 4 12 4 8 5.79 8 8s1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </span>
          Register New Creator
        </h3>
        <p className="registration-subtitle">Create a content creator account for this tenant.</p>
      </div>

      <div className="registration-fields-grid">
        <div className="registration-field">
          <label className="label" htmlFor="creator-name">
            Full Name
          </label>
          <div className="registration-input-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 12c2.76 0 5-2.24 5-5S14.76 2 12 2 7 4.24 7 7s2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z" />
              </svg>
            </span>
            <input
              id="creator-name"
              type="text"
              placeholder="Enter full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field registration-input-with-icon"
            />
          </div>
        </div>

        <div className="registration-field">
          <label className="label" htmlFor="creator-email">
            Contact Info
          </label>
          <div className="registration-input-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5L4 8V6l8 5 8-5v2z" />
              </svg>
            </span>
            <input
              id="creator-email"
              type="email"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field registration-input-with-icon"
            />
          </div>
          <p className="registration-hint">Use a valid email for sign in.</p>
        </div>

        <div className="registration-field registration-field-full">
          <label className="label" htmlFor="creator-password">
            Password
          </label>
          <div className="registration-input-wrap">
            <span className="registration-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 116 0v3H9z" />
              </svg>
            </span>
            <input
              id="creator-password"
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
        <button type="button" className="secondary-button full-width-button" onClick={handleSubmit}>
          Add User
        </button>
      </div>
      {message && <p className="success-message">{message}</p>}
    </div>
  );
};

export default ContentCreatorRegistrationForm;
