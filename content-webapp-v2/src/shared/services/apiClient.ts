import { API_BASE_URL } from '@/config/env';

let authToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

export function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

export interface RequestOptions {
  params?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60000;

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined) query.append(key, String(value));
  }
  const suffix = query.toString();
  return `${API_BASE_URL}${path}${suffix ? `?${suffix}` : ''}`;
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (response.status === 204) return null;
  if (contentType.includes('application/json')) return (await response.json()) as unknown;
  return response.text();
}

function messageFromBody(body: string): string {
  return body;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<{ data: T }> {
  const { params, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const init: RequestInit = {
      method,
      headers: { ...authHeaders(), ...headers },
      signal: controller.signal,
    };
    if (body !== undefined) {
      if (body instanceof FormData) {
        init.body = body;
      } else {
        (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
    }
    const response = await fetch(buildUrl(path, params), init);
    if (!response.ok) {
      if (response.status === 401 && authToken && path !== '/auth/login') {
        onSessionExpired?.();
      }
      throw new ApiError(response.status, messageFromBody(await response.text()));
    }
    const data = await parseBody(response);
    return { data: data as T };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out');
    }
    throw new ApiError(0, error instanceof Error ? error.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { params, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildUrl(path, params), {
      method: 'GET',
      headers: { ...authHeaders(), ...headers },
      signal: signal ?? controller.signal,
    });
    if (!response.ok) throw new ApiError(response.status, messageFromBody(await response.text()));
    return response.blob();
  } finally {
    clearTimeout(timer);
  }
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
  getBlob: (path: string, options?: RequestOptions) => requestBlob(path, options),
};
