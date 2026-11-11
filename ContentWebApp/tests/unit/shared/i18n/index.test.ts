import { describe, expect, it } from 'vitest';
import i18n from '@shared/i18n';

describe('i18n resource', () => {
  it.each([
    ['validation.required', 'Required'],
    ['validation.invalidEmail', 'Invalid email'],
    ['validation.passwordsMismatch', 'Passwords do not match'],
    ['validation.invalid', 'Invalid'],
    ['validation.passwordPolicy', 'Password policy'],
    ['a11y.loading', 'Loading'],
    ['a11y.breadcrumb', 'Breadcrumb'],
    ['a11y.primary', 'Primary'],
    ['a11y.pagination', 'Pagination'],
    ['jobs.sync.saved', '1 saved'],
    ['jobs.sync.skipped', '2 skipped'],
    ['jobs.sync.failed', '3 courses failed'],
  ])('translates %s', (key, expected) => {
    const count = Number(expected.match(/^\d+/)?.[0] ?? 0);
    expect(i18n.t(key, { count })).toBe(expected);
  });
});
