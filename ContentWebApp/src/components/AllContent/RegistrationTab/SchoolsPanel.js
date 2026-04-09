import React, { useState } from "react";
import PasswordInput from "../../PasswordInput";
import Modal from "../shared/Modal";
import "./css/RegistrationTab.css";
import "./css/TeacherRegistrationForm.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../shared/tables.css";
import "../shared/utilities.css";

const SchoolsPanel = ({
  schools,
  onCreateSchool,
  onUpdateSchool,
  onDeleteSchool,
  message,
  messageType = "success",
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [editingSchool, setEditingSchool] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const handleSubmit = async () => {
    const success = await onCreateSchool(name, email, password);
    if (success) {
      setName("");
      setEmail("");
      setPassword("");
    }
  };

  const openEdit = (school) => {
    setEditingSchool(school);
    setEditName(school.name);
    setEditEmail(school.email);
    setEditPassword("");
  };

  const closeEdit = () => setEditingSchool(null);

  const saveEdit = async () => {
    const success = await onUpdateSchool(
      editingSchool._id,
      editName,
      editEmail,
      editPassword || undefined
    );
    if (success) closeEdit();
  };

  return (
    <div className="card registration-flex-card">
      <div>
        <div className="card-title">School Management</div>
        <div className="card-description">Create and manage schools for your organisation.</div>
      </div>

      <div className="registration-card">
        <h3 className="registration-title">Create School</h3>
        <label className="label" htmlFor="school-name">
          Name
        </label>
        <input
          id="school-name"
          type="text"
          placeholder="School name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
        />
        <label className="label" htmlFor="school-email">
          Email
        </label>
        <input
          id="school-email"
          type="email"
          placeholder="School email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field"
        />
        <PasswordInput
          id="school-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="button" className="primary-button full-width-button" onClick={handleSubmit}>
          Create School
        </button>
        {message && (
          <p className={messageType === "error" ? "error-message" : "success-message"}>{message}</p>
        )}
      </div>

      <div className="teachers-section">
        <h3 className="teachers-section-title">Schools</h3>
        {schools.length === 0 ? (
          <div className="no-teachers">No schools yet.</div>
        ) : (
          <div className="table-scroll">
            <table className="students-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school) => (
                  <tr key={school._id}>
                    <td>{school.name}</td>
                    <td>{school.email}</td>
                    <td>
                      <button
                        type="button"
                        className="action-ghost-button"
                        onClick={() => openEdit(school)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="action-ghost-button"
                        onClick={() => onDeleteSchool(school._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingSchool && (
        <Modal title="Edit School" onClose={closeEdit}>
          <label className="label" htmlFor="edit-school-name">
            Name
          </label>
          <input
            id="edit-school-name"
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="input-field"
          />
          <label className="label" htmlFor="edit-school-email">
            Email
          </label>
          <input
            id="edit-school-email"
            type="email"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            className="input-field"
          />
          <PasswordInput
            id="edit-school-password"
            label="New Password (optional)"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
          />
          <div className="modal-actions">
            <button type="button" className="primary-button" onClick={saveEdit}>
              Save
            </button>
            <button type="button" className="action-ghost-button" onClick={closeEdit}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SchoolsPanel;
