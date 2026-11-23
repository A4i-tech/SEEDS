import { describe, expect, it } from 'vitest';

import { redirectSearchSchema } from '@/app/navigation/redirectSearch';

describe('redirectSearchSchema', () => {
  it('defaults a missing redirect to /home', () => {
    expect(redirectSearchSchema.parse({})).toEqual({ redirect: '/home' });
  });

  it('passes through same-origin paths', () => {
    expect(redirectSearchSchema.parse({ redirect: '/library/abc' })).toEqual({ redirect: '/library/abc' });
  });

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', 'library'])('replaces unsafe redirect %s with /home', (redirect) => {
    expect(redirectSearchSchema.parse({ redirect })).toEqual({ redirect: '/home' });
  });

  it('throws on a non-string redirect', () => {
    expect(() => redirectSearchSchema.parse({ redirect: 5 })).toThrow();
  });
});
