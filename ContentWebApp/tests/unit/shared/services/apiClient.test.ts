import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiClient, setAuthToken, setSessionExpiredHandler } from '../../../../src/shared/services/apiClient';

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

  it.each([
    [{ error: 'Nope', message: 'Nope', code: 'X' }, 400, 'Nope'],
    [{ detail: 'Not found' }, 404, 'Not found'],
    [{ message: 'Field required' }, 422, 'Field required'],
  ])('uses the human-readable message from %j', async (body, status, message) => {
    fetchMock.mockResolvedValue(jsonResponse(body, status));
    await expect(apiClient.get('/x')).rejects.toMatchObject({ status, message });
  });

  it('exposes code and details from the backend envelope', async () => {
    const details = { validation_errors: [{ loc: ['body', 'name'], msg: 'Field required' }] };
    fetchMock.mockResolvedValue(
      jsonResponse({ message: 'Request validation failed', code: 'VALIDATION_ERROR', details }, 422),
    );
    await expect(apiClient.get('/x')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed: name: Field required',
      details,
    });
  });

  it('uses plain text bodies and a status fallback for empty bodies', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('boom', 500));
    await expect(apiClient.get('/x')).rejects.toMatchObject({ message: 'boom' });
    fetchMock.mockResolvedValueOnce(textResponse('', 500));
    await expect(apiClient.get('/x')).rejects.toThrow('500');
  });

  it('clears the timeout timer when fetch rejects', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('net'));
    await expect(apiClient.get('/x')).rejects.toThrow('net');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timeout timer once the body is read', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await expect(apiClient.get('/x')).resolves.toEqual({ data: { ok: true } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the timeout active while the body stalls', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, { signal }: { signal: AbortSignal }) =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            new Promise((_, reject) => {
              signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
            }),
        }),
    );
    const pending = expect(apiClient.get('/x', { timeoutMs: 1000 })).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
  });

  it('gives blob downloads a longer timeout than the default', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return new Promise(() => {});
    });
    void apiClient.getBlob('/x');
    await vi.advanceTimersByTimeAsync(60000);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(240000);
    expect(signal!.aborted).toBe(true);
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

  it('omits params the caller does not pass', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await apiClient.get('/x', { params: { limit: 2 } });
    expect(fetchMock.mock.calls[0][0]).toBe('http://test-api/x?limit=2');
  });
});
