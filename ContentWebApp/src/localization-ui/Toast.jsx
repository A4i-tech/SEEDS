import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import "../components/AllContent/shared/utilities.css";
import "../components/AllContent/shared/buttons.css";
import "../components/AllContent/AnalyticsTab/css/AnalyticsTab.css";

const ToastCtx = createContext(null);
export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
};

const TONE_CLASS = { good: "success-message", crit: "error-message", info: "status-message" };

export function ToastProvider({ children }) {
  const [note, setNote] = useState(null);
  const timer = useRef(null);

  const dismiss = useCallback(() => {
    setNote(null);
    clearTimeout(timer.current);
  }, []);

  const toast = useCallback(({ message, tone = "info", duration = 5000, onUndo }) => {
    clearTimeout(timer.current);
    setNote({ message, tone, onUndo });
    timer.current = setTimeout(() => setNote(null), duration);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast, dismiss }}>
      {children}
      {note ? (
        <div className={TONE_CLASS[note.tone] || "status-message"} role="status">
          {note.message}
          {note.onUndo ? (
            <button
              type="button"
              className="action-ghost-button button-ml-8"
              onClick={() => {
                note.onUndo();
                dismiss();
              }}
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </ToastCtx.Provider>
  );
}

export default ToastProvider;
