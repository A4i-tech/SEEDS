import React from "react";
import "./css/StudentsTable.css";
import "../shared/tables.css";

const StudentsTable = ({ students, onRemoveStudent }) => {
  return (
    <div className="students-section">
      <div className="table-scroll">
        <table className="students-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={3} className="no-students-cell">
                  No students
                </td>
              </tr>
            ) : (
              students.map((student, index) => (
                <tr key={index}>
                  <td>{student.name}</td>
                  <td>{student.phoneNumber}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => onRemoveStudent(student.phoneNumber)}
                      className="action-ghost-button"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentsTable;
