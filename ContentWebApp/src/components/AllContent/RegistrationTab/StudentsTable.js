import React, { useState, useCallback, useEffect } from "react";
import "./css/StudentsTable.css";
import "../shared/tables.css";
import "../shared/modals.css";
import "../shared/buttons.css";
import { PhoneNumberInput } from "../shared/PhoneNumberInput";
import { PHONE_DIGITS_LENGTH } from "../../../utils/phoneUtils";

/** Show 10-digit form for edit (strip 91 prefix if present). */
const toDisplayPhone = (phone) => {
  if (!phone || typeof phone !== "string") return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  return d.slice(0, 10);
};

const StudentsTable = ({ students, teacher, onRemoveStudent, onUpdateStudent }) => {
  const [editing, setEditing] = useState(null); // { name, phoneNumber } of row being edited
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState("");

  const openEdit = useCallback((student) => {
    setEditing({ name: student.name, phoneNumber: student.phoneNumber });
    setEditName(student.name);
    setEditPhone(toDisplayPhone(student.phoneNumber));
    setEditError("");
  }, []);

  const closeEdit = useCallback(() => {
    setEditing(null);
    setEditName("");
    setEditPhone("");
    setEditError("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editing || !teacher || !onUpdateStudent) return;
    const name = (editName || "").trim();
    const phone = (editPhone || "").trim();
    if (!name || !phone) return;
    setEditError("");
    const result = await onUpdateStudent(teacher, editing.phoneNumber, name, phone);
    if (result === true) {
      closeEdit();
    } else {
      setEditError(typeof result === "string" ? result : "Failed to update student.");
    }
  }, [editing, teacher, editName, editPhone, onUpdateStudent, closeEdit]);

  useEffect(() => {
    if (!editing) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") closeEdit();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editing, closeEdit]);

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
              students.map((student) => (
                <tr key={student.phoneNumber}>
                  <td>{student.name}</td>
                  <td>{student.phoneNumber}</td>
                  <td className="students-actions-cell">
                    <button
                      type="button"
                      onClick={() => openEdit(student)}
                      className="action-ghost-button students-edit-btn"
                    >
                      Edit
                    </button>
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

      {editing && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-student-title" onClick={closeEdit}>
          <div className="edit-student-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="edit-student-title" className="edit-student-title">Edit student</h2>
            {editError && (
              <div className="edit-student-error" role="alert">
                {editError}
              </div>
            )}
            <div className="edit-student-form">
              <label>
                Name
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="edit-student-input"
                  placeholder="Name"
                />
              </label>
              <label>
                Phone number
                <PhoneNumberInput
                  value={editPhone}
                  onChange={setEditPhone}
                  placeholder="Phone number"
                  className="edit-student-input"
                />
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary-button" onClick={closeEdit}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleSaveEdit}
                disabled={!editName.trim() || !editPhone || editPhone.length !== PHONE_DIGITS_LENGTH}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsTable;
