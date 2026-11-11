import { z } from 'zod';

import { API_BASE_URL } from '@/config/env';
import { text } from '@shared/utils/schema';

let tokenGetter: () => string = () => '';
let refreshHandler: () => Promise<string> = async () => '';
let onSessionExpired: () => void = () => {};

export function setTokenGetter(getter: () => string) {
  tokenGetter = getter;
}

export function setRefreshHandler(handler: () => Promise<string>) {
  refreshHandler = handler;
}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export function authHeaders(): Record<string, string> {
  const token = tokenGetter();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

 interface RequestOptions {
  params?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60000;
export const LONG_TIMEOUT_MS = 600000;
const BLOB_TIMEOUT_MS = 300000;

function buildUrl(path: string, params: RequestOptions['params'] = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.append(key, String(value));
  }
  const suffix = query.toString();
  if (!suffix) return `${API_BASE_URL}${path}`;
  return `${API_BASE_URL}${path}?${suffix}`;
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

const validationItemSchema = z.object({
  loc: z.array(z.union([z.string(), z.number()])).default([]),
  msg: text,
});

const errorDetailsSchema = z.object({ validation_errors: z.array(validationItemSchema).default([]) });

const errorBodySchema = z.object({
  message: text,
  detail: z.union([z.string(), z.array(validationItemSchema)]).default(''),
  code: text,
  details: errorDetailsSchema.default({ validation_errors: [] }),
});

type ErrorDetails = z.infer<typeof errorDetailsSchema>;

export class ApiError extends Error {
  status: number;
  code: string;
  details: ErrorDetails;

  constructor(status: number, message: string, code = '', details: ErrorDetails = { validation_errors: [] }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function describeValidationItem({ loc, msg }: z.infer<typeof validationItemSchema>): string {
  return `${loc.slice(1).join('.')}: ${msg}`;
}

async function buildApiError(response: Response): Promise<ApiError> {
  const text = await response.text();
  const fallback = text || `Request failed with status ${response.status}`;
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return new ApiError(response.status, fallback);
  }
  const parsed = errorBodySchema.safeParse(JSON.parse(text));
  if (!parsed.success) return new ApiError(response.status, fallback);
  const { message, detail, code, details } = parsed.data;
  const items = details.validation_errors.concat(typeof detail === 'string' ? [] : detail);
  const base = message || (typeof detail === 'string' && detail) || fallback;
  const suffix = items.length ? `: ${items.map(describeValidationItem).join('; ')}` : '';
  return new ApiError(response.status, `${base}${suffix}`, code, details);
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type');
  if (response.status === 204) return undefined;
  if (contentType?.includes('application/json')) return response.json();
  return response.text();
}

export async function rejectResponse(path: string, response: Response): Promise<never> {
  if (
    response.status === 401 &&
    tokenGetter() &&
    path !== '/auth/login' &&
    path !== '/auth/token/refresh' &&
    path !== '/tenant/logout'
  ) {
    onSessionExpired();
  }
  throw await buildApiError(response);
}

async function fetchResponse<T>(
  path: string,
  params: RequestOptions['params'],
  init: RequestInit,
  timeoutMs: number,
  read: (response: Response) => Promise<T>,
  retried = false,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const hadToken = !!tokenGetter();
  try {
    const response = await fetch(buildUrl(path, params), {
      credentials: 'include',
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      if (
        response.status === 401 &&
        hadToken &&
        !retried &&
        path !== '/auth/login' &&
        path !== '/auth/token/refresh' &&
        path !== '/tenant/logout'
      ) {
        try {
          await refreshHandler();
        } catch {
          onSessionExpired();
          throw await buildApiError(response);
        }
        return fetchResponse(
          path,
          params,
          { ...init, headers: { ...init.headers, ...authHeaders() } },
          timeoutMs,
          read,
          true,
        );
      }
      return await rejectResponse(path, response);
    }
    return await read(response);
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<{ data: T }> {
  const { params, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const init: RequestInit = { method, headers: authHeaders() };
  if (body !== undefined) {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return { data: (await fetchResponse(path, params, init, timeoutMs, parseBody)) as T };
}

async function requestForm<T>(path: string, form: FormData, options: RequestOptions = {}): Promise<T> {
  const { params, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const init: RequestInit = { method: 'POST', headers: authHeaders(), body: form };
  return fetchResponse(path, params, init, timeoutMs, parseBody) as Promise<T>;
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { params, timeoutMs = BLOB_TIMEOUT_MS } = options;
  const init: RequestInit = { method: 'GET', headers: authHeaders() };
  return fetchResponse(path, params, init, timeoutMs, (response) => response.blob());
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
  postForm: <T>(path: string, form: FormData, options?: RequestOptions) => requestForm<T>(path, form, options),
  getBlob: (path: string, options?: RequestOptions) => requestBlob(path, options),
};
