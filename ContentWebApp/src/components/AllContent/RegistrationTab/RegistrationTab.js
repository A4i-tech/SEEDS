import React from "react";
import TeacherRegistrationForm from "./TeacherRegistrationForm";
import TeachersList from "./TeachersList";
import TeacherDetails from "./TeacherDetails";
import DuplicateStudentModal from "./DuplicateStudentModal";
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
  messageType,
  onAddStudentRow,
  onRemoveStudentRow,
  onSetNewStudentValue,
  onSubmitNewStudents,
  onRemoveStudent,
  onUpdateStudent,
  pendingDuplicates,
  onResolveDuplicates,
  onDismissDuplicateModal,
}) => {
  return (
    <div className="card registration-flex-card">
      <div>
        <div className="card-title">Registration Management</div>
        <div className="card-description">Register teachers for your organization.</div>
      </div>

      <TeacherRegistrationForm onRegister={onRegisterTeacher} message={message} messageType={messageType} />

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
              onUpdateStudent={onUpdateStudent}
            />
          </div>
        )}
      </div>

      <DuplicateStudentModal
        open={Boolean(pendingDuplicates?.duplicates?.length)}
        duplicates={pendingDuplicates?.duplicates ?? []}
        onResolve={(resolution) => onResolveDuplicates(resolution, pendingDuplicates)}
        onCancel={onDismissDuplicateModal}
      />
    </div>
  );
};

export default RegistrationTab;
