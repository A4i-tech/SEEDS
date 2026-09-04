import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastCtx = createContext(null);
export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const toast = useCallback(
    ({ message, tone = "info", duration = 5000, onUndo }) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, message, tone, onUndo }]);
      timers.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastCtx.Provider value={{ toast, dismiss }}>
      {children}
      <div className="loca-ui-toasts" role="region" aria-label="Notifications">
        <div aria-live="polite" aria-atomic="true" style={{ display: "contents" }}>
          {toasts.map((t) => (
            <div key={t.id} className={`loca-ui-toast ${t.tone}`} role="status">
              <span className="msg">{t.message}</span>
              {t.onUndo ? (
                <button
                  className="undo"
                  onClick={() => {
                    t.onUndo();
                    dismiss(t.id);
                  }}
                >
                  Undo
                </button>
              ) : null}
              <button className="modal-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastCtx.Provider>
  );
}

export default ToastProvider;
