import React, { useState, useCallback, useEffect } from "react";
import "../shared/buttons.css";
import "../shared/tables.css";
import "../shared/modals.css";
import { PhoneNumberInput } from "../shared/PhoneNumberInput";
import { PHONE_DIGITS_LENGTH } from "../../../utils/phoneUtils";

const toDisplayPhone = (phone) => {
  if (!phone || typeof phone !== "string") return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  return d.slice(0, 10);
};

const StudentsTable = ({ students = [], teacher, onRemoveStudent, onUpdateStudent }) => {
  const [editing, setEditing] = useState(null);
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
    <>
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
                <tr key={student._id}>
                  <td>{student.name}</td>
                  <td>{student.phoneNumber}</td>
                  <td>
                    <button type="button" className="action-ghost-button" onClick={() => openEdit(student)}>Edit</button>
                    <button type="button" className="action-ghost-button" onClick={() => onRemoveStudent(student._id)}>Remove</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Edit Student</h3>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Name"
            />
            <PhoneNumberInput
              value={editPhone}
              onChange={setEditPhone}
              maxLength={PHONE_DIGITS_LENGTH}
            />
            {editError && <p className="error">{editError}</p>}
            <div className="modal-actions">
              <button type="button" className="action-ghost-button" onClick={handleSaveEdit}>Save</button>
              <button type="button" className="action-ghost-button" onClick={closeEdit}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StudentsTable;
