import { useCallback, useEffect, useState } from "react";

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
    }
  }, [full, value]);
  return [value, setValue];
}

export function useLastSession() {
  const [session, setSession] = usePersistentState("lastSession", null);
  const remember = useCallback(
    (scope) => setSession({ ...scope, at: Date.now() }),
    [setSession]
  );
  return [session, remember];
}
