import React from "react";
import "./utilities.css";
import "../RegistrationTab/css/TeachersList.css";

export const StatusPill = ({ status }) => {
  const isActive = status.toLowerCase() === "active";
  if (!isActive) return <span className="placeholder-text">{status}</span>;
  return <span className="role-badge teacher-role-badge">{status}</span>;
};

export default StatusPill;
