import React from "react";
import RowActions from "../shared/RowActions";
import "../shared/buttons.css";
import "../shared/tables.css";

const StudentsTable = ({ students = [], onEditStudent, onRemoveStudent }) => {
  return (
    <div className="table-wrapper">
      <table className="content-table">
        <thead>
          <tr>
            <th className="table-header">Name</th>
            <th className="table-header">Phone</th>
            <th className="table-header">Actions</th>
          </tr>
        </thead>
        <tbody>
          {students.length === 0 ? (
            <tr>
              <td colSpan={3} className="table-cell no-content">No students</td>
            </tr>
          ) : (
            students.map((student) => (
              <tr key={student.id} className="table-row-white">
                <td className="table-cell">{student.name}</td>
                <td className="table-cell">{student.phone_number}</td>
                <td className="table-cell">
                  <RowActions
                    horizontal
                    actions={[
                      { key: "edit", label: "Edit", variant: "edit", onClick: () => onEditStudent(student) },
                      { key: "delete", label: "Remove", variant: "delete", onClick: () => onRemoveStudent(student.id) },
                    ]}
                  />
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
