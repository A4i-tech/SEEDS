import { useCallback, useEffect, useState } from "react";

/**
 * localStorage-backed state — used for remembered UI preferences
 * (theme, Live Preview open/width, "Continue previous session" scope).
 * No backend; purely client persistence.
 */
const NS = "locaui.";

export function usePersistentState(key, initial) {
  const full = NS + key;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(full);
      return raw != null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(full, JSON.stringify(value));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [full, value]);
  return [value, setValue];
}

/** Read/write the last workspace scope so the dashboard can "Continue". */
export function useLastSession() {
  const [session, setSession] = usePersistentState("lastSession", null);
  const remember = useCallback(
    (scope) => setSession({ ...scope, at: Date.now() }),
    [setSession]
  );
  return [session, remember];
}
