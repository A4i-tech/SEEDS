import { afterEach, describe, expect, it, vi } from 'vitest';

describe('env', () => {
  afterEach(() => {
    delete window.__ENV__;
    vi.resetModules();
  });

  it('exports the base URL from env.js', async () => {
    window.__ENV__ = { REACT_APP_API_BASE_URL: 'http://api.test' };
    const { API_BASE_URL } = await import('@/config/env');
    expect(API_BASE_URL).toBe('http://api.test');
  });

  it('throws naming the key when env.js lacks it', async () => {
    window.__ENV__ = {};
    await expect(import('@/config/env')).rejects.toThrow('Missing REACT_APP_API_BASE_URL in /env.js');
  });
});
