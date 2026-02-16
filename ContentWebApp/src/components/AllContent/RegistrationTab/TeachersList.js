import React from "react";
import "./css/TeachersList.css";
import "../shared/buttons.css";

const TeachersList = ({ entries, selectedTeacherId, onSelectTeacher }) => {
  return (
    <div className="teachers-list-pane">
      <div className="teachers-list-title">Users</div>
      <ul className="teachers-list">
        {entries.map((entry) => (
          <li key={`${entry.role}-${entry.id}`} className="teacher-list-item">
            <button
              type="button"
              onClick={() => onSelectTeacher(entry.id)}
              className={`teacher-button ${
                String(entry.id) === String(selectedTeacherId) ? "selected" : ""
              }`}
            >
              <div className="teacher-button-head">
                <span className="teacher-name">{entry.name}</span>
                <span
                  className={`role-badge ${
                    entry.role === "content_creator" ? "creator-role-badge" : "teacher-role-badge"
                  }`}
                >
                  {entry.role === "content_creator" ? "Creator" : "Teacher"}
                </span>
              </div>
              <div className="teacher-meta">{entry.contact}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TeachersList;
