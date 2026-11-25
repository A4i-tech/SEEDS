import { describe, expect, it } from 'vitest';
import { decodeJwtRole, decodeJwtSchoolId } from '../../../../src/shared/utils/jwt';

function makeToken(payload: unknown): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${b64}.sig`;
}

describe('decodeJwtRole', () => {
  it('returns the role claim from a valid token', () => {
    expect(decodeJwtRole(makeToken({ role: 'tenant' }))).toBe('tenant');
    expect(decodeJwtRole(makeToken({ role: 'content_creator' }))).toBe('content_creator');
  });

  it('throws when the payload has no role', () => {
    expect(() => decodeJwtRole(makeToken({ iss: 'school_admin' }))).toThrow();
  });

  it('throws on a role outside the allowed set', () => {
    expect(() => decodeJwtRole(makeToken({ role: 'teacher' }))).toThrow();
  });

  it('throws on a malformed token', () => {
    expect(() => decodeJwtRole('not-a-jwt')).toThrow();
    expect(() => decodeJwtRole('onlyonesegment')).toThrow();
  });
});

describe('decodeJwtSchoolId', () => {
  it('returns the school_id claim', () => {
    expect(decodeJwtSchoolId(makeToken({ role: 'school_admin', school_id: 's1' }))).toBe('s1');
  });

  it('returns an empty string when the claim is absent', () => {
    expect(decodeJwtSchoolId(makeToken({ role: 'tenant' }))).toBe('');
  });
});
