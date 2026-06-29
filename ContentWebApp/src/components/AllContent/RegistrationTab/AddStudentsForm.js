import React from "react";
import "./css/AddStudentsForm.css";
import "../shared/buttons.css";
import "../shared/utilities.css";
import { PhoneNumberInput } from "../shared/PhoneNumberInput";

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
            onChange={(e) => onSetNewStudentValue(teacher.id, index, "name", e.target.value)}
            className="add-students-input"
          />
          <PhoneNumberInput
            placeholder="Phone number"
            value={student.phoneNumber}
            onChange={(value) =>
              onSetNewStudentValue(teacher.id, index, "phoneNumber", value)
            }
            className="add-students-input"
          />
          <button
            type="button"
            onClick={() => onRemoveStudentRow(teacher.id, index)}
            className="action-ghost-button"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="add-students-buttons">
        <button
          type="button"
          onClick={() => onAddStudentRow(teacher.id)}
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
