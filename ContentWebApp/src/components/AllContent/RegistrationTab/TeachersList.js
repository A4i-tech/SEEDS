import React from "react";
import "./css/TeachersList.css";
import "../shared/buttons.css";

const TeachersList = ({ teachers, selectedTeacherId, onSelectTeacher }) => {
  return (
    <div className="teachers-list-pane">
      <div className="teachers-list-title">Teachers</div>
      <ul className="teachers-list">
        {teachers.map((teacher) => (
          <li key={teacher._id} className="teacher-list-item">
            <button
              type="button"
              onClick={() => onSelectTeacher(teacher._id)}
              className={`teacher-button ${
                String(teacher._id) === String(selectedTeacherId) ? "selected" : ""
              }`}
            >
              {`${teacher.name || "Unknown"} — ${teacher.phoneNumber}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TeachersList;
