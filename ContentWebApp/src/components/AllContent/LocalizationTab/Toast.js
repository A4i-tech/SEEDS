import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import "../shared/utilities.css";
import "../shared/buttons.css";
import "../AnalyticsTab/css/AnalyticsTab.css";

const ToastCtx = createContext(null);
export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
};

const TONE_CLASS = { good: "success-message", crit: "error-message", info: "status-message" };

export function ToastProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const note = queue[0];

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  const toast = useCallback(
    ({ message, tone = "info", duration = 5000, onUndo }) =>
      setQueue((q) => [...q, { message, tone, duration, onUndo }]),
    []
  );

  useEffect(() => {
    if (!note) return undefined;
    const timer = setTimeout(dismiss, note.duration);
    return () => clearTimeout(timer);
  }, [note, dismiss]);

  return (
    <ToastCtx.Provider value={{ toast, dismiss }}>
      {children}
      {note && (
        <div className={TONE_CLASS[note.tone]} role="status">
          {note.message}
          {note.onUndo && (
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
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export default ToastProvider;
