import { apiFetch } from "./api";

const TIMEOUT_MS = 15000;

export const request = (url, options = {}) => apiFetch(url, { timeoutMs: TIMEOUT_MS, ...options });
