import { create } from 'axios';
import { API_BASE_URL } from '@config/env';

let authToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

export const apiClient = create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isLoginRequest = error.config?.url === '/teacher/login';

    if ((status === 401 || status === 403) && authToken && !isLoginRequest) {
      onSessionExpired?.();

      return Promise.reject(new Error('Session expired. Please login again.'));
    }

    return Promise.reject(error);
  }
);
