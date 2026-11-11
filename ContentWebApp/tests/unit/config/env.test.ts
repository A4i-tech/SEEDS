import { afterEach, describe, expect, it, vi } from 'vitest';

describe('env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('exports the configured base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    vi.resetModules();
    const { API_BASE_URL } = await import('@/config/env');
    expect(API_BASE_URL).toBe('http://api.test');
  });

  it('throws when VITE_API_BASE_URL is not set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.resetModules();
    await expect(import('@/config/env')).rejects.toThrow('VITE_API_BASE_URL is not set');
  });
});
