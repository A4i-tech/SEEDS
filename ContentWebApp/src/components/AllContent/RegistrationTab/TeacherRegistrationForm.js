import React, { useState } from "react";
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
    <div className="registration-card">
      <h3 className="registration-title">Register Teacher / Content Creator</h3>
      <label className="label" htmlFor="teacher-name">Name</label>
      <input
        id="teacher-name"
        type="text"
        placeholder="Enter name"
        value={teacherName}
        onChange={(e) => setTeacherName(e.target.value)}
        className="input-field"
        required
      />
      <label className="label" htmlFor="teacher-phone">
        Phone Number
      </label>
      <PhoneNumberInput
        id="teacher-phone"
        placeholder="Enter phone number"
        value={teacherPhone}
        onChange={setTeacherPhone}
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
      <label className="label" htmlFor="teacher-role">Role</label>
      <select
        id="teacher-role"
        value={teacherRole}
        onChange={(e) => setTeacherRole(e.target.value)}
        className="input-field"
      >
        <option value="teacher">Teacher</option>
        <option value="content_creator">Content Creator</option>
      </select>
      <button type="button" className="primary-button full-width-button" onClick={handleSubmit}>
        Save User
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
