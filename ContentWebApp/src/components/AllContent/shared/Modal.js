import React, { useEffect, useRef, useCallback } from "react";
import "./modal.css";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

const Modal = ({ title, onClose, children }) => {
  const cardRef = useRef(null);
  const previousFocusRef = useRef(null);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab" && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll(FOCUSABLE);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    document.addEventListener("keydown", handleKeyDown);

    // Move focus into the modal on open
    const timer = requestAnimationFrame(() => {
      if (cardRef.current) {
        const first = cardRef.current.querySelector(FOCUSABLE);
        if (first) first.focus();
      }
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      cancelAnimationFrame(timer);
      // Restore focus to the element that opened the modal
      if (previousFocusRef.current) previousFocusRef.current.focus();
    };
  }, [handleKeyDown]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" ref={cardRef} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
