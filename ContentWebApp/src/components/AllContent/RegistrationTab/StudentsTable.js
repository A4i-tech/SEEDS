import React from "react";
import RowActions from "../shared/RowActions";
import TableSkeleton from "../shared/TableSkeleton";
import "../shared/buttons.css";
import "../shared/tables.css";

const StudentsTable = ({ students = [], isLoading, onEditStudent, onRemoveStudent }) => {
  if (isLoading && students.length === 0) {
    return (
      <div className="table-wrapper">
        <TableSkeleton columns={["Name", "Phone", "Actions"]} />
      </div>
    );
  }

  if (students.length === 0) {
    return <div className="no-teachers">No students yet.</div>;
  }

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
          {students.map((student) => (
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
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default StudentsTable;
