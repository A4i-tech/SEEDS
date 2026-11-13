import { Alert, AlertText } from '@/components/ui/alert';
import React from 'react';

const RESTORE_DISPLAY_MS = 3_000;

type ConnectivityStatus = 'online' | 'degraded' | 'offline';

export function ConnectionBanner({ status, prevStatus }: { status: ConnectivityStatus; prevStatus: ConnectivityStatus }) {
  const [showRestored, setShowRestored] = React.useState(false);

  React.useEffect(() => {
    if (status === 'online' && prevStatus !== 'online') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transient banner keyed to a status transition, not derivable at render time
      setShowRestored(true);
      const timeout = setTimeout(() => setShowRestored(false), RESTORE_DISPLAY_MS);

      return () => clearTimeout(timeout);
    }
    setShowRestored(false);
  }, [status, prevStatus]);

  if (status === 'offline') {
    return (
      <Alert variant="destructive">
        <AlertText>No internet connection</AlertText>
      </Alert>
    );
  }

  if (status === 'degraded') {
    return (
      <Alert>
        <AlertText>Weak connection detected</AlertText>
      </Alert>
    );
  }

  if (showRestored) {
    return (
      <Alert>
        <AlertText>Connection restored</AlertText>
      </Alert>
    );
  }

  return null;
}
