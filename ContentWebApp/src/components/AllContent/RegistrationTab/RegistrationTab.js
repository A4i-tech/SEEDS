import React from "react";
import TeacherRegistrationForm from "./TeacherRegistrationForm";
import TeachersList from "./TeachersList";
import TeacherDetails from "./TeacherDetails";
import SchoolsPanel from "./SchoolsPanel";
import { getRole } from "../../../utils/authHelpers";
import "./css/RegistrationTab.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/tables.css";
import "../shared/utilities.css";

const RegistrationTab = ({
  teachers,
  selectedTeacher,
  selectedTeacherId,
  onSelectTeacher,
  onRegisterTeacher,
  onAddStudentRow,
  onRemoveStudentRow,
  onSetNewStudentValue,
  onSubmitNewStudents,
  onRemoveStudentFromTeacher,
  message,
  messageType,
  schools,
  onCreateSchool,
  onUpdateSchool,
  onDeleteSchool,
  schoolMessage,
  schoolMessageType,
}) => {
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
    <div className="card registration-page-card">
      <div className="registration-page-header">
        <div className="card-title">Registration Management</div>
        <div className="card-description">
          Manage teachers, students, and content creators for your tenant.
        </div>
      </div>

      <TeacherRegistrationForm
        onRegister={onRegisterTeacher}
        message={message}
        messageType={messageType}
      />

      <section className="team-directory-section" aria-labelledby="team-directory-title">
        <h2 id="team-directory-title" className="team-directory-title">
          Team Directory
        </h2>
        <div className="teachers-layout">
          <TeachersList
            teachers={teachers}
            selectedTeacherId={selectedTeacherId}
            onSelectTeacher={onSelectTeacher}
          />
          <TeacherDetails
            teacher={selectedTeacher}
            onAddStudentRow={onAddStudentRow}
            onRemoveStudentRow={onRemoveStudentRow}
            onSetNewStudentValue={onSetNewStudentValue}
            onSubmitNewStudents={onSubmitNewStudents}
            onRemoveStudent={onRemoveStudentFromTeacher}
          />
        </div>
      </section>
    </div>
  );
};

export default RegistrationTab;
