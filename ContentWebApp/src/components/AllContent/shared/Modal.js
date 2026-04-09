import React, { useEffect, useRef } from "react";
import "./modal.css";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

const Modal = ({ title, onClose, children }) => {
  const cardRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    const timer = requestAnimationFrame(() => {
      if (cardRef.current) {
        const first = cardRef.current.querySelector(FOCUSABLE);
        if (first) first.focus();
      }
    });

    return () => {
      cancelAnimationFrame(timer);
      if (previousFocusRef.current) previousFocusRef.current.focus();
    };
  }, []);

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
