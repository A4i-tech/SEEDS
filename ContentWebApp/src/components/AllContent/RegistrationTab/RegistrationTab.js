import React, { useState } from "react";
import TeacherRegistrationForm from "./TeacherRegistrationForm";
import TeachersList from "./TeachersList";
import TeacherDetails from "./TeacherDetails";
import "./css/RegistrationTab.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/tables.css";
import "../shared/utilities.css";
import { USER_ROLES } from "../../../Constants";

const RegistrationTab = ({
  teachers,
  selectedTeacher,
  selectedTeacherId,
  onSelectTeacher,
  onRegisterUser,
  message,
  onAddStudentRow,
  onRemoveStudentRow,
  onSetNewStudentValue,
  onSubmitNewStudents,
  onRemoveStudent,
}) => {
  const [registerRole, setRegisterRole] = useState("teacher");
  const teacherList = Array.isArray(teachers) ? teachers : [];
  const normalizedSelectedRole =
    selectedTeacher?.role === USER_ROLES.CONTENT_CREATOR
      ? USER_ROLES.CONTENT_CREATOR
      : USER_ROLES.TEACHER;

  return (
    <div className="card registration-flex-card">
      <div>
        <div className="card-title">Registration Management</div>
        <div className="card-description">
          Manage teachers, students, and content creators for your tenant.
        </div>
      </div>

      <div className="registration-form-panel">
        <TeacherRegistrationForm
          role={registerRole}
          onRoleChange={(nextRole) => {
            setRegisterRole(nextRole);
          }}
          onRegisterUser={onRegisterUser}
          message={message}
        />
      </div>

      <div className="teachers-section">
        <h3 className="teachers-section-title">Team Directory</h3>
        {teacherList.length === 0 ? (
          <div className="no-teachers">No users available.</div>
        ) : (
          <div className="teachers-layout">
            <TeachersList
              teachers={teacherList}
              selectedTeacherId={selectedTeacherId}
              onSelectTeacher={onSelectTeacher}
            />
            <TeacherDetails
              teacher={selectedTeacher}
              selectedEntryRole={normalizedSelectedRole}
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
