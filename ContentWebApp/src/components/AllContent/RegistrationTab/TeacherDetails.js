import React from "react";
import StudentsTable from "./StudentsTable";
import AddStudentsForm from "./AddStudentsForm";
import "./css/TeacherDetails.css";
import "../shared/buttons.css";
import "../shared/tables.css";
import "../shared/utilities.css";

const TeacherDetails = ({
  teacher,
  onAddStudentRow,
  onRemoveStudentRow,
  onSetNewStudentValue,
  onSubmitNewStudents,
  onRemoveStudent,
}) => {
  if (!teacher) {
    return (
      <div className="teacher-details-pane">
        <div className="placeholder-text">Select a teacher to view details.</div>
      </div>
    );
  }

  return (
    <div className="teacher-details-pane">
      <div className="teacher-details-header">
        <div className="students-title">Students</div>
        <div className="teacher-info-text">Teacher: {teacher.phoneNumber}</div>
      </div>

      <StudentsTable
        students={teacher.students || []}
        onRemoveStudent={(studentPhone) => onRemoveStudent(teacher, studentPhone)}
      />

      <AddStudentsForm
        teacher={teacher}
        onAddStudentRow={onAddStudentRow}
        onRemoveStudentRow={onRemoveStudentRow}
        onSetNewStudentValue={onSetNewStudentValue}
        onSubmitNewStudents={onSubmitNewStudents}
      />
    </div>
  );
};

export default TeacherDetails;
