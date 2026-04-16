import React from "react";
import "../shared/buttons.css";
import "../shared/tables.css";

const StudentsTable = ({ students = [], onEditStudent, onRemoveStudent }) => {
  const hasActions = Boolean(onEditStudent || onRemoveStudent);

  return (
    <div className="table-scroll">
      <table className="students-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            {hasActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {students.length === 0 ? (
            <tr>
              <td colSpan={hasActions ? 3 : 2} className="no-content">No students</td>
            </tr>
          ) : (
            students.map((student) => (
              <tr key={student._id || student.phoneNumber}>
                <td>{student.name}</td>
                <td>{student.phoneNumber}</td>
                {hasActions && (
                  <td className="students-actions-cell">
                    {onEditStudent && (
                      <button type="button" className="action-ghost-button" onClick={() => onEditStudent(student)}>Edit</button>
                    )}
                    {onRemoveStudent && (
                      <button type="button" className="action-ghost-button" onClick={() => onRemoveStudent(student)}>Remove</button>
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StudentsTable;
