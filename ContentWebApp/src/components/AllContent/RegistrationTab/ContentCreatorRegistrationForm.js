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
    <div className="registration-card">
      <h3 className="registration-title">Add Content Creator</h3>
      <label className="label" htmlFor="creator-name">
        Name
      </label>
      <input
        id="creator-name"
        type="text"
        placeholder="Enter full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="input-field"
      />

      <label className="label" htmlFor="creator-email">
        Email
      </label>
      <input
        id="creator-email"
        type="email"
        placeholder="Enter email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input-field"
      />

      <label className="label" htmlFor="creator-password">
        Password
      </label>
      <input
        id="creator-password"
        type="password"
        placeholder="Set a password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="input-field"
      />

      <button type="button" className="secondary-button full-width-button" onClick={handleSubmit}>
        Save Content Creator
      </button>
      {message && <p className="success-message">{message}</p>}
    </div>
  );
};

export default ContentCreatorRegistrationForm;
