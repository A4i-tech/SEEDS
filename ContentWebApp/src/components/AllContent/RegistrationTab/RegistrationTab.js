import React, { useMemo, useState } from "react";
import TeacherRegistrationForm from "./TeacherRegistrationForm";
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
  const [registerRole, setRegisterRole] = useState("teacher");
  const mergedDirectoryEntries = useMemo(
    () => [
      ...teachers.map((teacher) => ({
        id: teacher._id,
        role: "teacher",
        name: teacher.name || "Unknown",
        contact: teacher.phoneNumber || "-",
      })),
      ...contentCreators.map((creator) => ({
        id: creator.id || creator._id,
        role: "content_creator",
        name: creator.name || "Unnamed Creator",
        contact: creator.email || "-",
      })),
    ],
    [teachers, contentCreators]
  );

  const selectedDirectoryEntry = mergedDirectoryEntries.find(
    (entry) => String(entry.id) === String(selectedTeacherId)
  );

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
          onRegisterTeacher={onRegisterTeacher}
          onRegisterContentCreator={onRegisterContentCreator}
          teacherMessage={message}
          creatorMessage={creatorMessage}
        />
      </div>

      <div className="teachers-section">
        <h3 className="teachers-section-title">Team Directory</h3>
        {mergedDirectoryEntries.length === 0 ? (
          <div className="no-teachers">No users available.</div>
        ) : (
          <div className="teachers-layout">
            <TeachersList
              entries={mergedDirectoryEntries}
              selectedTeacherId={selectedTeacherId}
              onSelectTeacher={onSelectTeacher}
            />
            <TeacherDetails
              teacher={selectedTeacher}
              selectedEntryRole={selectedDirectoryEntry?.role}
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
