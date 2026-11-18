import { afterEach, describe, expect, it, vi } from 'vitest';

import { initUmami } from '@shared/utils/umami';

const scripts = () => document.head.querySelectorAll('script[data-website-id]');

describe('initUmami', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    document.head.innerHTML = '';
  });

  it('adds no script unless both variables are set', () => {
    vi.stubEnv('VITE_UMAMI_SCRIPT_URL', 'https://umami.test/script.js');
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', '');
    initUmami();
    vi.stubEnv('VITE_UMAMI_SCRIPT_URL', '');
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'site-1');
    initUmami();
    expect(scripts()).toHaveLength(0);
  });

  it('adds one deferred script when both variables are set', () => {
    vi.stubEnv('VITE_UMAMI_SCRIPT_URL', 'https://umami.test/script.js');
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'site-1');
    initUmami();
    const [script] = scripts() as unknown as HTMLScriptElement[];
    expect(scripts()).toHaveLength(1);
    expect(script.src).toBe('https://umami.test/script.js');
    expect(script.dataset.websiteId).toBe('site-1');
    expect(script.defer).toBe(true);
  });
});
