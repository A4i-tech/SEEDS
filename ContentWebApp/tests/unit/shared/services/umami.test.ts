import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const umami = { track: vi.fn(), identify: vi.fn() };

async function load() {
  vi.resetModules();
  return import('@shared/services/umami');
}

const script = () => document.head.querySelector<HTMLScriptElement>('script[data-website-id]');

describe('umami', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    script()?.remove();
    delete window.umami;
  });

  it.each([
    ['', 'site-1'],
    ['https://umami.test', ''],
  ])('adds no script and sends nothing when the URL (%j) or website ID (%j) is empty', async (url, id) => {
    const { initUmami, track } = await load();
    window.umami = umami;
    initUmami(url, id);
    track('login');
    expect(script()).toBeNull();
    expect(umami.track).not.toHaveBeenCalled();
  });

  it('queues calls until the script loads, then sends them in order', async () => {
    const { initUmami, identify, track } = await load();
    initUmami('https://umami.test', 'site-1');
    expect(script()!.src).toBe('https://umami.test/script.js');

    identify('u1', { role: 'tenant' });
    identify('u2', { role: 'school_admin' });
    track('login');
    expect(umami.identify).not.toHaveBeenCalled();

    window.umami = umami;
    script()!.onload!(new Event('load'));
    expect(umami.identify.mock.calls).toEqual([['u1', { role: 'tenant' }], ['u2', { role: 'school_admin' }]]);
    expect(umami.track).toHaveBeenCalledWith('login');

    track('after');
    expect(umami.track).toHaveBeenLastCalledWith('after');
  });

  it('drops the queue and logs when the script fails to load', async () => {
    const { initUmami, track } = await load();
    initUmami('https://umami.test', 'site-1');
    track('login');
    script()!.onerror!(new Event('error'));
    window.umami = umami;
    track('later');
    expect(umami.track).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('https://umami.test/script.js did not load'));
  });
});
