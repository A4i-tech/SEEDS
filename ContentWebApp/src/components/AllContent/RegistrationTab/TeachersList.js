import React from "react";
import "../shared/buttons.css";
import "./css/TeachersList.css";
import { USER_ROLES } from "../../../Constants";

const TeachersList = ({ teachers, selectedTeacherId, onSelectTeacher }) => {
  const teacherList = Array.isArray(teachers) ? teachers : [];
  const list = teacherList;

  return (
    <div className="teachers-list-pane">
      {list.length === 0 ? (
        <div className="no-teachers">No users yet.</div>
      ) : (
        <ul className="teachers-list">
          {list.map((teacher) => {
            const role = teacher.role;
            const isCreator = role === USER_ROLES.CONTENT_CREATOR;
            return (
              <li key={teacher._id} className="teacher-list-item">
                <button
                  type="button"
                  onClick={() => onSelectTeacher(teacher._id)}
                  className={`teacher-button ${
                    String(teacher._id) === String(selectedTeacherId) ? "selected" : ""
                  }`}
                >
                  <div className="teacher-button-head">
                    <span className="teacher-name">{teacher.name || "Unknown"}</span>
                    <span
                      className={`role-badge ${
                        isCreator ? "creator-role-badge" : "teacher-role-badge"
                      }`}
                    >
                      {isCreator ? "Creator" : "Teacher"}
                    </span>
                  </div>
                  <span className="teacher-meta">{teacher.phoneNumber || "-"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default TeachersList;
