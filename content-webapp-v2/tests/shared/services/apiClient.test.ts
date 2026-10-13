import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiClient, setAuthToken, setSessionExpiredHandler } from '../../../src/shared/services/apiClient';

vi.mock('@/config/env', () => ({ API_BASE_URL: 'http://test-api' }));

const fetchMock = vi.fn();
const onSessionExpired = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}

describe('apiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    setAuthToken('');
    setSessionExpiredHandler(onSessionExpired);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on ok json response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ a: 1 }));
    await expect(apiClient.get('/x')).resolves.toEqual({ data: { a: 1 } });
  });

  it('returns text on ok non-json response', async () => {
    fetchMock.mockResolvedValue(textResponse('hi'));
    await expect(apiClient.get('/x')).resolves.toEqual({ data: 'hi' });
  });

  it('throws ApiError on non-ok and notifies session expiry on 401 when a token is set', async () => {
    setAuthToken('t');
    fetchMock.mockResolvedValue(textResponse('nope', 401));
    await expect(apiClient.get('/x')).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does not notify session expiry on 401 without a token or on the login path', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('', 401));
    await expect(apiClient.get('/x')).rejects.toMatchObject({ status: 401 });
    setAuthToken('t');
    fetchMock.mockResolvedValueOnce(textResponse('', 401));
    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({ status: 401 });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('does not notify session expiry on 403 and lets the error reach the caller', async () => {
    setAuthToken('t');
    fetchMock.mockResolvedValue(textResponse('Access denied', 403));
    await expect(apiClient.get('/x')).rejects.toMatchObject({ status: 403, message: 'Access denied' });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('uses the raw error body as the message', async () => {
    const body = JSON.stringify({ detail: 'x' });
    fetchMock.mockResolvedValue(textResponse(body, 400));
    await expect(apiClient.get('/x')).rejects.toMatchObject({ status: 400, message: body });
  });

  it('aborts the request when timeoutMs elapses', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, { signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    );
    const pending = expect(apiClient.get('/x', { timeoutMs: 1000 })).rejects.toMatchObject({ name: 'AbortError' });
    vi.advanceTimersByTime(1000);
    await pending;
  });

  it('applies a 60s default timeout when timeoutMs is not set', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return new Promise(() => {});
    });
    void apiClient.get('/x');
    await vi.advanceTimersByTimeAsync(59999);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal!.aborted).toBe(true);
  });

  it('does not notify session expiry on other error statuses', async () => {
    setAuthToken('t');
    fetchMock.mockResolvedValue(textResponse('boom', 500));
    await expect(apiClient.get('/x')).rejects.toMatchObject({ status: 500 });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('wraps network errors instead of mapping them to ApiError status 0', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(apiClient.get('/x')).rejects.toThrow('offline');
  });

  it('sends the bearer token and method', async () => {
    setAuthToken('sig');
    fetchMock.mockResolvedValue(textResponse('markdown'));
    await expect(apiClient.get('/x')).resolves.toEqual({ data: 'markdown' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test-api/x',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer sig' } }),
    );
  });

  it('returns a blob from getBlob', async () => {
    const blob = new Blob(['abc']);
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => blob });
    const out = await apiClient.getBlob('/y');
    expect(out.size).toBe(3);
  });

  it('throws ApiError on non-ok for get and getBlob', async () => {
    fetchMock.mockImplementation(async () => textResponse('', 404));
    await expect(apiClient.get('/x')).rejects.toBeInstanceOf(ApiError);
    await expect(apiClient.getBlob('/x')).rejects.toMatchObject({ status: 404 });
  });

  it('serializes scalar params into the query string', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await apiClient.get('/x', { params: { limit: 10, cursor: 'abc' } });
    expect(fetchMock.mock.calls[0][0]).toBe('http://test-api/x?limit=10&cursor=abc');
  });

  it('skips undefined params', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await apiClient.get('/x', { params: { limit: 2, cursor: undefined } });
    expect(fetchMock.mock.calls[0][0]).toBe('http://test-api/x?limit=2');
  });
});
