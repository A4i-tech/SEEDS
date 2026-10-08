import { API_BASE_URL } from '@/config/env';

let authToken = '';
let onSessionExpired: () => void = () => {};

export function setAuthToken(token: string) {
  authToken = token;
}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export function authHeaders(): Record<string, string> {
  if (!authToken) return {};
  return { Authorization: `Bearer ${authToken}` };
}

export interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60000;

function buildUrl(path: string, params: RequestOptions['params'] = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.append(key, String(value));
  }
  const suffix = query.toString();
  if (!suffix) return `${API_BASE_URL}${path}`;
  return `${API_BASE_URL}${path}?${suffix}`;
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
  const contentType = response.headers.get('content-type');
  if (response.status === 204) return undefined;
  if (contentType?.includes('application/json')) return response.json();
  return response.text();
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
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      init.headers = { ...init.headers, 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const response = await fetch(buildUrl(path, params), init);
    if (!response.ok) {
      if (response.status === 401 && authToken && path !== '/auth/login') {
        onSessionExpired();
      }
      throw new ApiError(response.status, await response.text());
    }
    const data = await parseBody(response);
    return { data: data as T };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out');
    }
    if (error instanceof Error) throw new ApiError(0, error.message);
    throw new ApiError(0, 'Network request failed');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { params, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const response = await fetch(buildUrl(path, params), {
      method: 'GET',
      headers: { ...authHeaders(), ...headers },
      signal: controller.signal,
    });
    if (!response.ok) throw new ApiError(response.status, await response.text());
    return response.blob();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
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
