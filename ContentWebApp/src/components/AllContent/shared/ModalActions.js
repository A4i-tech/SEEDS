import React from "react";
import "./buttons.css";
import "./modal.css";

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

export default ModalActions;
