import { renderHook, act } from '@testing-library/react';
import { useConnectivity } from '../../src/hooks/useConnectivity';

const flushPromises = () => Promise.resolve();

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('initial status is online', () => {
  const { result } = renderHook(() => useConnectivity());
  expect(result.current.status).toBe('online');
  expect(result.current.prevStatus).toBe('online');
});

test('offline event sets status to offline after 1s debounce', async () => {
  const { result } = renderHook(() => useConnectivity());
  act(() => window.dispatchEvent(new Event('offline')));
  expect(result.current.status).toBe('online');
  act(() => jest.advanceTimersByTime(1100));
  expect(result.current.status).toBe('offline');
});

test('online event after offline triggers ping and sets online when fast', async () => {
  global.fetch.mockResolvedValue({ ok: true });
  const { result } = renderHook(() => useConnectivity());
  act(() => window.dispatchEvent(new Event('offline')));
  act(() => jest.advanceTimersByTime(1100));
  act(() => window.dispatchEvent(new Event('online')));
  await act(async () => { await flushPromises(); });
  act(() => jest.advanceTimersByTime(1100));
  expect(result.current.status).toBe('online');
  expect(result.current.prevStatus).toBe('offline');
});

test('session ping sets degraded when response is slow', async () => {
  global.fetch.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 3000))
  );
  const { result } = renderHook(() => useConnectivity({ isSessionActive: true }));
  await act(async () => {
    jest.advanceTimersByTime(10_000);
    await flushPromises();
    jest.advanceTimersByTime(3_000);
    await flushPromises();
    jest.advanceTimersByTime(1_100);
  });
  expect(result.current.status).toBe('degraded');
});

test('session ping sets offline when fetch throws', async () => {
  global.fetch.mockRejectedValue(new Error('network error'));
  const { result } = renderHook(() => useConnectivity({ isSessionActive: true }));
  // Fire interval → ping() called → fetch rejects (microtask)
  act(() => jest.advanceTimersByTime(10_000));
  // Flush rejection microtask → catch block → applyStatus sets debounce timer
  await act(async () => {});
  // Fire debounce → setStatus('offline')
  act(() => jest.advanceTimersByTime(1_100));
  expect(result.current.status).toBe('offline');
});

test('no interval started when isSessionActive is false', async () => {
  global.fetch.mockResolvedValue({ ok: true });
  renderHook(() => useConnectivity({ isSessionActive: false }));
  act(() => jest.advanceTimersByTime(60_000));
  expect(global.fetch).not.toHaveBeenCalled();
});
