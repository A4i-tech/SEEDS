import { API_BASE_URL } from '@config/env';
import NetInfo from '@react-native-community/netinfo';
import React from 'react';

const PING_INTERVAL_MS = 10_000;
const PING_THRESHOLD_MS = 2_000;
const ABORT_TIMEOUT_MS = 5_000;
const DEBOUNCE_MS = 1_000;

export function useConnectivity(isSessionActive: boolean) {
  const [status, setStatus] = React.useState<'online' | 'degraded' | 'offline'>('online');
  const [prevStatus, setPrevStatus] = React.useState<'online' | 'degraded' | 'offline'>('online');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const applyStatus = React.useCallback((next: 'online' | 'degraded' | 'offline') => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setStatus((prev) => {
        setPrevStatus(prev);
        return next;
      });
    }, DEBOUNCE_MS);
  }, []);

  const ping = React.useCallback(async () => {
    const controller = new AbortController();
    const hardAbort = setTimeout(() => controller.abort(), ABORT_TIMEOUT_MS);
    const start = Date.now();
    try {
      await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
      applyStatus(Date.now() - start >= PING_THRESHOLD_MS ? 'degraded' : 'online');
    } catch {
      applyStatus('offline');
    } finally {
      clearTimeout(hardAbort);
    }
  }, [applyStatus]);

  React.useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected === false) {
        applyStatus('offline');
      } else {
        ping();
      }
    });
    return unsubscribe;
  }, [applyStatus, ping]);

  React.useEffect(() => {
    if (!isSessionActive) return;
    const interval = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isSessionActive, ping]);

  React.useEffect(() => () => clearTimeout(debounceRef.current), []);

  return { status, prevStatus };
}
