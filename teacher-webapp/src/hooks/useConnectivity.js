import { useState, useEffect, useRef, useCallback } from "react";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

const PING_INTERVAL_MS = 10_000;
const PING_THRESHOLD_MS = 2_000;
const ABORT_TIMEOUT_MS = 5_000;
const DEBOUNCE_MS = 1_000;

export function useConnectivity({ isSessionActive = false } = {}) {
  const [status, setStatus] = useState("online");
  const [prevStatus, setPrevStatus] = useState("online");
  const intervalRef = useRef(null);
  const debounceRef = useRef(null);

  const applyStatus = useCallback((next) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setStatus((prev) => {
        setPrevStatus(prev);
        return next;
      });
    }, DEBOUNCE_MS);
  }, []);

  const ping = useCallback(async () => {
    const controller = new AbortController();
    const hardAbort = setTimeout(() => controller.abort(), ABORT_TIMEOUT_MS);
    const start = Date.now();
    try {
      await fetch(API_ENDPOINTS.HEALTH_PING, { signal: controller.signal });
      const elapsed = Date.now() - start;
      applyStatus(elapsed >= PING_THRESHOLD_MS ? "degraded" : "online");
    } catch {
      applyStatus("offline");
    } finally {
      clearTimeout(hardAbort);
    }
  }, [applyStatus]);

  useEffect(() => {
    const handleOffline = () => applyStatus("offline");
    const handleOnline = () => ping();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [applyStatus, ping]);

  useEffect(() => {
    if (!isSessionActive) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [isSessionActive, ping]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return { status, prevStatus };
}
