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
  messageType,
  schools,
  onCreateSchool,
  onUpdateSchool,
  onDeleteSchool,
  schoolMessage,
  schoolMessageType,
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
        messageType={schoolMessageType}
      />
    );
  }

  return (
    <div className="card registration-flex-card">
      <div>
        <div className="card-title">Registration Management</div>
        <div className="card-description">Manage teachers and students for your school.</div>
      </div>

      <div className="pill-tabs">
        <button
          type="button"
          className={`pill-tab ${activeSection === "teachers" ? "pill-tab--active" : ""}`}
          onClick={() => setActiveSection("teachers")}
        >
          Teachers
        </button>
        <button
          type="button"
          className={`pill-tab ${activeSection === "students" ? "pill-tab--active" : ""}`}
          onClick={() => setActiveSection("students")}
        >
          Students
        </button>
      </div>

      {activeSection === "teachers" && (
        <>
          <TeacherRegistrationForm
            onRegister={onRegisterTeacher}
            message={message}
            messageType={messageType}
          />
          <div className="teachers-section">
            <h3 className="teachers-section-title">Teachers</h3>
            <TeachersList
              teachers={teachers}
              schools={schools}
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
