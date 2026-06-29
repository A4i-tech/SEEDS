import React from "react";
import "../shared/buttons.css";
import "../shared/tables.css";

const StudentsTable = ({ students = [], onEditStudent, onRemoveStudent }) => {
  return (
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
              <td colSpan={3} className="no-content">No students</td>
            </tr>
          ) : (
            students.map((student) => (
              <tr key={student.id}>
                <td>{student.name}</td>
                <td>{student.phoneNumber}</td>
                <td>
                  <button type="button" className="action-ghost-button" onClick={() => onEditStudent(student)}>Edit</button>
                  <button type="button" className="action-ghost-button" onClick={() => onRemoveStudent(student.id)}>Remove</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StudentsTable;
