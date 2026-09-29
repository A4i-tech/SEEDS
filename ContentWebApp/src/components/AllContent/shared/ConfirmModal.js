import React from "react";
import Modal from "./Modal";
import "./buttons.css";
import "./RowActions.css";

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

export default ConfirmModal;
