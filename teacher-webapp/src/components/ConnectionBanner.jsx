import { useState, useEffect } from "react";
import { Alert } from "@mui/material";

const RESTORE_DISPLAY_MS = 3_000;

export function ConnectionBanner({ status, prevStatus }) {
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    if (status === "online" && prevStatus !== "online") {
      setShowRestored(true);
      const t = setTimeout(() => setShowRestored(false), RESTORE_DISPLAY_MS);
      return () => clearTimeout(t);
    }
    setShowRestored(false);
  }, [status, prevStatus]);

  if (status === "offline") {
    return (
      <Alert severity="error" sx={{ borderRadius: 0 }}>
        No internet connection
      </Alert>
    );
  }
  if (status === "degraded") {
    return (
      <Alert severity="warning" sx={{ borderRadius: 0 }}>
        Weak connection detected
      </Alert>
    );
  }
  if (showRestored) {
    return (
      <Alert severity="success" sx={{ borderRadius: 0 }}>
        Connection restored
      </Alert>
    );
  }
  return null;
}
