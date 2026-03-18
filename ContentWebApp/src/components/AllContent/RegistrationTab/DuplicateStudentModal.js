import React, { useState, useCallback, useEffect } from "react";
import "./css/DuplicateStudentModal.css";
import "../shared/modals.css";
import "../shared/buttons.css";

/**
 * Modal shown when one or more students have a phone number already registered
 * with a different name. User can choose per student: keep existing name or update to new name.
 */
const DuplicateStudentModal = ({ open, duplicates = [], onResolve = () => {}, onCancel = () => {} }) => {
  const [choices, setChoices] = useState({}); // index -> 'keep' | 'update'

  useEffect(() => {
    if (open) setChoices({});
  }, [open]);

  const setChoice = useCallback((index, keepName) => {
    setChoices((prev) => ({ ...prev, [index]: keepName ? "keep" : "update" }));
  }, []);

  const handleConfirm = useCallback(() => {
    const resolution = duplicates.map((d, i) => ({
      phoneNumber: d.phoneNumber,
      existingName: d.existingName,
      submittedName: d.submittedName,
      keepName: choices[i] === "keep",
    }));
    onResolve(resolution);
    setChoices({});
  }, [duplicates, choices, onResolve]);

  const handleCancel = useCallback(() => {
    setChoices({});
    onCancel();
  }, [onCancel]);

  const allChosen =
    duplicates.length > 0 &&
    duplicates.every((_, i) => choices[i] === "keep" || choices[i] === "update");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") handleCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
      onClick={handleCancel}
    >
      <div className="duplicate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="duplicate-modal-header">
          <h2 id="duplicate-modal-title" className="duplicate-modal-title">
            Student already registered
          </h2>
          <p className="duplicate-modal-subtitle">
            This phone number is already registered with a different name. Choose to keep the existing name or update it.
          </p>
        </div>
        <div className="duplicate-modal-body">
          {duplicates.map((d, i) => (
            <div key={i} className="duplicate-modal-row">
              <div className="duplicate-modal-row-info">
                <span className="duplicate-modal-phone">{d.phoneNumber}</span>
                <span className="duplicate-modal-names">
                  Registered as <strong>"{d.existingName}"</strong>. You entered <strong>"{d.submittedName}"</strong>.
                </span>
              </div>
              <div className="duplicate-modal-actions">
                <button
                  type="button"
                  className={choices[i] === "keep" ? "primary-button" : "secondary-button"}
                  onClick={() => setChoice(i, true)}
                >
                  Keep "{d.existingName}"
                </button>
                <button
                  type="button"
                  className={choices[i] === "update" ? "primary-button" : "secondary-button"}
                  onClick={() => setChoice(i, false)}
                >
                  Update to "{d.submittedName}"
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={handleCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleConfirm}
            disabled={!allChosen}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default DuplicateStudentModal;
