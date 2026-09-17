import React from "react";
import Modal from "../../../components/AllContent/shared/Modal";
import "../../../components/AllContent/shared/utilities.css";
import "../../../components/AllContent/shared/cards.css";
import "../../../components/AllContent/shared/buttons.css";
import "../../../components/AllContent/RegistrationTab/css/TeachersList.css";

export const StatusPill = ({ status }) => {
  const isActive = status.toLowerCase() === "active";
  if (!isActive) return <span className="placeholder-text">{status}</span>;
  return <span className="role-badge teacher-role-badge">{status}</span>;
};

export function Header({ title, subtitle, search, onSearch, addLabel, onAdd, children }) {
  return (
    <>
      <div className="card-header">
        <div>
          <h1 className="card-title">{title}</h1>
          <p className="card-description">{subtitle}</p>
        </div>
        <div className="button-group">
          <input
            type="search"
            className="input-field"
            placeholder={`Search ${title.toLowerCase()}`}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            style={{ width: 200 }}
            aria-label={`Search ${title.toLowerCase()}`}
          />
          {addLabel && (
            <button type="button" className="primary-button" onClick={onAdd}>
              {addLabel}
            </button>
          )}
        </div>
      </div>
      {children}
    </>
  );
}

export function ModalActions({ onCancel, onSave, disabled }) {
  return (
    <div className="modal-actions">
      <button type="button" className="action-ghost-button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="primary-button" onClick={onSave} disabled={disabled}>
        Save
      </button>
    </div>
  );
}

export function ConfirmModal({ title, description, confirmLabel, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{description}</p>
      <div className="modal-actions">
        <button type="button" className="action-ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="row-action row-action-delete" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
