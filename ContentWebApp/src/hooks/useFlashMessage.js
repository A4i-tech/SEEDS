import { useState, useCallback, useRef } from "react";

/**
 * Manages a timed flash message with an optional type ('success' | 'error' | null).
 * Calling flashMessage again before the timer expires resets the timer.
 */
export function useFlashMessage() {
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(null);
  const timerRef = useRef(null);

  const flashMessage = useCallback((msg, type = null) => {
    clearTimeout(timerRef.current);
    setMessage(msg);
    setMessageType(type);
    timerRef.current = setTimeout(() => {
      setMessage("");
      setMessageType(null);
    }, 3000);
  }, []);

  return { message, messageType, flashMessage };
}
