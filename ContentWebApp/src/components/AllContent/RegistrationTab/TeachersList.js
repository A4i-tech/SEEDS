import React, { useState } from "react";
import Modal from "../shared/Modal";
import RowActions from "../shared/RowActions";
import PasswordInput from "../../PasswordInput";
import TableSkeleton from "../shared/TableSkeleton";
import { USER_ROLES } from "../../../Constants";
import "../shared/buttons.css";
import "../shared/tables.css";
import "../shared/utilities.css";
import "./css/TeachersList.css";

const TeachersList = ({ teachers, schools = [], isLoading, onUpdateTeacher, onDeleteTeacher, onTransferTeacher }) => {
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const [transferringTeacher, setTransferringTeacher] = useState(null);
  const [targetSchoolId, setTargetSchoolId] = useState("");

  const openEdit = (teacher) => {
    setEditingTeacher(teacher);
    setEditName(teacher.name);
    setEditPhone(teacher.phone_number || "");
    setEditPassword("");
  };

  const closeEdit = () => setEditingTeacher(null);

  const saveEdit = async () => {
    const success = await onUpdateTeacher(editingTeacher.id, editName, editPhone, editPassword || undefined);
    if (success) closeEdit();
  };

  const openTransfer = (teacher) => {
    setTransferringTeacher(teacher);
    setTargetSchoolId("");
  };

  const closeTransfer = () => setTransferringTeacher(null);

  const saveTransfer = async () => {
    const success = await onTransferTeacher(transferringTeacher.id, targetSchoolId);
    if (success) closeTransfer();
  };

  return (
    <>
      {isLoading && teachers.length === 0 ? (
        <div className="table-wrapper">
          <TableSkeleton columns={["Name", "Phone", "Actions"]} />
        </div>
      ) : teachers.length === 0 ? (
        <div className="no-teachers">No teachers registered yet.</div>
      ) : (
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
              {teachers.map((teacher) => {
                const isCreator = teacher.role === USER_ROLES.CONTENT_CREATOR;
                return (
                  <tr key={teacher.id} className="table-row-white">
                    <td className="table-cell">
                      <span className="teacher-cell-name">{teacher.name}</span>
                      <span
                        className={`role-badge ${
                          isCreator ? "creator-role-badge" : "teacher-role-badge"
                        }`}
                      >
                        {isCreator ? "Creator" : "Teacher"}
                      </span>
                    </td>
                    <td className="table-cell">{teacher.phone_number}</td>
                    <td className="table-cell">
                      <RowActions
                        horizontal
                        actions={[
                          { key: "edit", label: "Edit", variant: "edit", onClick: () => openEdit(teacher) },
                          { key: "sync", label: "Transfer", variant: "sync", onClick: () => openTransfer(teacher) },
                          { key: "delete", label: "Remove", variant: "delete", onClick: () => onDeleteTeacher(teacher.id) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
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
            Transfer <strong>{transferringTeacher.name}</strong> to another school.
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
              <option key={s.id} value={s.id}>{s.name}</option>
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
