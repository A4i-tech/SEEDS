import React, { useState } from "react";
import Modal from "../shared/Modal";
import PasswordInput from "../../PasswordInput";
import "../shared/buttons.css";
import "../shared/tables.css";
import "../shared/utilities.css";

const TeachersList = ({ teachers, schools = [], onUpdateTeacher, onDeleteTeacher, onTransferTeacher }) => {
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const [transferringTeacher, setTransferringTeacher] = useState(null);
  const [targetSchoolId, setTargetSchoolId] = useState("");

  const openEdit = (teacher) => {
    setEditingTeacher(teacher);
    setEditName(teacher.name || "");
    setEditPhone(teacher.phoneNumber || "");
    setEditPassword("");
  };

  const closeEdit = () => setEditingTeacher(null);

  const saveEdit = async () => {
    const success = await onUpdateTeacher(editingTeacher._id, editName, editPhone, editPassword || undefined);
    if (success) closeEdit();
  };

  const openTransfer = (teacher) => {
    setTransferringTeacher(teacher);
    setTargetSchoolId("");
  };

  const closeTransfer = () => setTransferringTeacher(null);

  const saveTransfer = async () => {
    const success = await onTransferTeacher(transferringTeacher._id, targetSchoolId);
    if (success) closeTransfer();
  };

  return (
    <>
      {teachers.length === 0 ? (
        <div className="no-teachers">No teachers registered yet.</div>
      ) : (
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
              {teachers.map((teacher) => (
                <tr key={teacher._id}>
                  <td>{teacher.name || "—"}</td>
                  <td>{teacher.phoneNumber}</td>
                  <td>
                    <button type="button" className="action-ghost-button" onClick={() => openEdit(teacher)}>Edit</button>
                    <button type="button" className="action-ghost-button" onClick={() => openTransfer(teacher)}>Transfer</button>
                    <button type="button" className="action-ghost-button" onClick={() => onDeleteTeacher(teacher._id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingTeacher && (
        <Modal title="Edit Teacher" onClose={closeEdit}>
          <label className="label" htmlFor="edit-teacher-name">Name</label>
          <input
            id="edit-teacher-name"
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="input-field"
          />
          <label className="label" htmlFor="edit-teacher-phone">Phone Number</label>
          <input
            id="edit-teacher-phone"
            type="tel"
            value={editPhone}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              if (val.length <= 10) setEditPhone(val);
            }}
            maxLength={10}
            className="input-field"
          />
          <PasswordInput
            id="edit-teacher-password"
            label="New Password (optional)"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
          />
          <div className="modal-actions">
            <button type="button" className="primary-button" onClick={saveEdit}>Save</button>
            <button type="button" className="action-ghost-button" onClick={closeEdit}>Cancel</button>
          </div>
        </Modal>
      )}

      {transferringTeacher && (
        <Modal title="Transfer Teacher" onClose={closeTransfer}>
          <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#475569" }}>
            Transfer <strong>{transferringTeacher.name || transferringTeacher.phoneNumber}</strong> to another school.
          </p>
          <label className="label" htmlFor="transfer-school-id">Target School</label>
          <select
            id="transfer-school-id"
            value={targetSchoolId}
            onChange={(e) => setTargetSchoolId(e.target.value)}
            className="input-field"
          >
            <option value="">Select a school</option>
            {schools.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
          <div className="modal-actions">
            <button type="button" className="primary-button" onClick={saveTransfer}>Transfer</button>
            <button type="button" className="action-ghost-button" onClick={closeTransfer}>Cancel</button>
          </div>
        </Modal>
      )}
    </>
  );
};

export default TeachersList;
