import React, { useState } from "react";
import TeacherRegistrationForm from "./TeacherRegistrationForm";
import TeachersList from "./TeachersList";
import StudentsSection from "./StudentsSection";
import SchoolsPanel from "./SchoolsPanel";
import { getRole } from "../../../utils/authHelpers";
import "./css/RegistrationTab.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/tables.css";
import "../shared/utilities.css";

const tabsStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  borderRadius: "999px",
  backgroundColor: "#f1f5f9",
  padding: "4px",
  gap: "4px",
};

const tabButtonStyle = (active) => ({
  border: "none",
  borderRadius: "999px",
  padding: "10px 0",
  fontSize: "14px",
  fontWeight: 600,
  cursor: active ? "default" : "pointer",
  backgroundColor: active ? "#0f172a" : "transparent",
  color: active ? "#fff" : "#475569",
  transition: "background-color 0.2s ease",
});

const RegistrationTab = ({
  teachers,
  students,
  onRegisterTeacher,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onUpdateTeacher,
  onDeleteTeacher,
  onTransferTeacher,
  message,
  schools,
  onCreateSchool,
  onUpdateSchool,
  onDeleteSchool,
  schoolMessage,
}) => {
  const [activeSection, setActiveSection] = useState("teachers");

  if (getRole() === "tenant") {
    return (
      <SchoolsPanel
        schools={schools}
        onCreateSchool={onCreateSchool}
        onUpdateSchool={onUpdateSchool}
        onDeleteSchool={onDeleteSchool}
        message={schoolMessage}
      />
    );
  }

  return (
    <div className="card registration-flex-card">
      <div>
        <div className="card-title">Registration Management</div>
        <div className="card-description">Manage teachers and students for your school.</div>
      </div>

      <div style={tabsStyle}>
        <button
          type="button"
          style={tabButtonStyle(activeSection === "teachers")}
          onClick={() => setActiveSection("teachers")}
        >
          Teachers
        </button>
        <button
          type="button"
          style={tabButtonStyle(activeSection === "students")}
          onClick={() => setActiveSection("students")}
        >
          Students
        </button>
      </div>

      {activeSection === "teachers" && (
        <>
          <TeacherRegistrationForm onRegister={onRegisterTeacher} message={message} />
          <div className="teachers-section">
            <h3 className="teachers-section-title">Teachers</h3>
            <TeachersList
              teachers={teachers}
              onUpdateTeacher={onUpdateTeacher}
              onDeleteTeacher={onDeleteTeacher}
              onTransferTeacher={onTransferTeacher}
            />
          </div>
        </>
      )}

      {activeSection === "students" && (
        <StudentsSection
          students={students}
          onAddStudent={onAddStudent}
          onUpdateStudent={onUpdateStudent}
          onDeleteStudent={onDeleteStudent}
        />
      )}
    </div>
  );
};

export default RegistrationTab;
