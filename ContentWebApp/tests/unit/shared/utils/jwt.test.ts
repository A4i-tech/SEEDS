import { describe, expect, it } from 'vitest';
import { decodeJwtRole, isJwtExpired } from '../../../../src/shared/utils/jwt';

function makeToken(payload: unknown): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${b64}.sig`;
}

describe('decodeJwtRole', () => {
  it('returns the role claim from a valid token', () => {
    expect(decodeJwtRole(makeToken({ role: 'tenant' }))).toBe('tenant');
    expect(decodeJwtRole(makeToken({ role: 'content_creator' }))).toBe('content_creator');
  });

  it('returns undefined when the payload has no role', () => {
    expect(decodeJwtRole(makeToken({ iss: 'school_admin' }))).toBeUndefined();
  });

  it('throws on a malformed token', () => {
    expect(() => decodeJwtRole('not-a-jwt')).toThrow();
    expect(() => decodeJwtRole('onlyonesegment')).toThrow();
  });
});

describe('isJwtExpired', () => {
  it('returns true for a past exp', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(isJwtExpired(makeToken({ exp: past }))).toBe(true);
  });

  it('returns false for a future exp', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(isJwtExpired(makeToken({ exp: future }))).toBe(false);
  });

  it('throws on a malformed token', () => {
    expect(() => isJwtExpired('not-a-jwt')).toThrow();
  });
});
