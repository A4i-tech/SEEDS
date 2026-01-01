import React from "react";
import "./css/AddStudentsForm.css";
import "../shared/buttons.css";
import "../shared/utilities.css";

const AddStudentsForm = ({
  teacher,
  onAddStudentRow,
  onRemoveStudentRow,
  onSetNewStudentValue,
  onSubmitNewStudents,
}) => {
  return (
    <div className="add-students-section">
      <strong>Add students (multiple):</strong>
      {(teacher.newStudents || []).map((student, index) => (
        <div key={index} className="add-students-row">
          <input
            placeholder="Name"
            value={student.name}
            onChange={(e) => onSetNewStudentValue(teacher._id, index, "name", e.target.value)}
            className="add-students-input"
          />
          <input
            placeholder="Phone number"
            value={student.phoneNumber}
            onChange={(e) =>
              onSetNewStudentValue(teacher._id, index, "phoneNumber", e.target.value)
            }
            className="add-students-input"
          />
          <button
            type="button"
            onClick={() => onRemoveStudentRow(teacher._id, index)}
            className="action-ghost-button"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="add-students-buttons">
        <button
          type="button"
          onClick={() => onAddStudentRow(teacher._id)}
          className="secondary-button"
        >
          + Add another student
        </button>
        <button
          type="button"
          onClick={() => onSubmitNewStudents(teacher)}
          className="primary-button button-ml-8"
          disabled={teacher.submitting}
        >
          {teacher.submitting ? "Adding…" : "Submit students"}
        </button>
      </div>
    </div>
  );
};

export default AddStudentsForm;
