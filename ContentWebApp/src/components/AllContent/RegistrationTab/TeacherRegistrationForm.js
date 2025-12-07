import React, { useState } from "react";
import "./css/TeacherRegistrationForm.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/utilities.css";

const TeacherRegistrationForm = ({ onRegister, message }) => {
  const [teacherPhone, setTeacherPhone] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");

  const handleSubmit = async () => {
    const success = await onRegister(teacherPhone, teacherPassword);
    if (success) {
      setTeacherPhone("");
      setTeacherPassword("");
    }
  };

  return (
    <div className="registration-card">
      <h3 className="registration-title">Register Teacher</h3>
      <label className="label" htmlFor="teacher-phone">
        Phone Number
      </label>
      <input
        id="teacher-phone"
        type="tel"
        placeholder="Enter phone number"
        value={teacherPhone}
        onChange={(e) => {
          const value = e.target.value.replace(/\D/g, "");
          if (value.length <= 10) {
            setTeacherPhone(value);
          }
        }}
        maxLength={10}
        className="input-field"
      />
      <label className="label" htmlFor="teacher-password">
        Password
      </label>
      <input
        id="teacher-password"
        type="password"
        placeholder="Set a password"
        value={teacherPassword}
        onChange={(e) => setTeacherPassword(e.target.value)}
        className="input-field"
      />
      <button
        type="button"
        className="primary-button full-width-button"
        onClick={handleSubmit}
      >
        Save Teacher
      </button>
      {message && <p className="success-message">{message}</p>}
    </div>
  );
};

export default TeacherRegistrationForm;
