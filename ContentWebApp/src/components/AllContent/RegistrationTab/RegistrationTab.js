import React from "react";
import TeacherRegistrationForm from "./TeacherRegistrationForm";
import ContentCreatorRegistrationForm from "./ContentCreatorRegistrationForm";
import ContentCreatorsList from "./ContentCreatorsList";
import TeachersList from "./TeachersList";
import TeacherDetails from "./TeacherDetails";
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
  message,
  onAddStudentRow,
  onRemoveStudentRow,
  onSetNewStudentValue,
  onSubmitNewStudents,
  onRemoveStudent,
  contentCreators,
  onRegisterContentCreator,
  creatorMessage,
}) => {
  return (
    <div className="card registration-flex-card">
      <div>
        <div className="card-title">Registration Management</div>
        <div className="card-description">
          Manage teachers, students, and content creators for your tenant.
        </div>
      </div>

      <div className="registration-forms-grid">
        <TeacherRegistrationForm onRegister={onRegisterTeacher} message={message} />
        <ContentCreatorRegistrationForm
          onRegister={onRegisterContentCreator}
          message={creatorMessage}
        />
      </div>

      <ContentCreatorsList creators={contentCreators} />

      <div className="teachers-section">
        <h3 className="teachers-section-title">Teachers & Students</h3>
        {teachers.length === 0 ? (
          <div className="no-teachers">No teachers available.</div>
        ) : (
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
              onRemoveStudent={onRemoveStudent}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default RegistrationTab;
