import { beforeEach, describe, expect, it } from 'vitest';

import { router } from '@app/navigation/router';
import { canAccess } from '@app/navigation/roleAccess';
import { useAuthStore } from '@features/auth/store/useAuthStore';

describe('canAccess', () => {
  it.each([
    ['tenant', '/localize', true],
    ['school_admin', '/localize/add', false],
    ['content_creator', '/localize', false],
    ['tenant', '/analytics', true],
    ['school_admin', '/registration', true],
    ['content_creator', '/analytics', false],
    ['content_creator', '/registration', false],
    ['content_creator', '/library/$kind/$id', true],
    ['content_creator', '/ivr-view', true],
    ['content_creator', '/review/text/$jobId', true],
    ['content_creator', '/home', true],
    ['content_creator', '/account/profile', true],
    ['textbook_remediation_volunteer', '/jobs', true],
    ['textbook_remediation_volunteer', '/make-accessible/$jobId', true],
    ['textbook_remediation_volunteer', '/review/remediate/$jobId', true],
    ['textbook_remediation_volunteer', '/library', false],
    ['textbook_remediation_volunteer', '/create', false],
    ['textbook_remediation_volunteer', '/registration', false],
    ['textbook_remediation_volunteer', '/account/profile', false],
    ['', '/library', false],
    ['', '/home', true],
  ])('%s on %s -> %s', (role, path, expected) => {
    expect(canAccess(role, path)).toBe(expected);
  });
});

describe('router role redirect', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'authenticated' });
  });

  it.each([
    ['content_creator', '/localize', '/home'],
    ['content_creator', '/analytics', '/home'],
    ['content_creator', '/registration', '/home'],
    ['school_admin', '/localize', '/home'],
    ['content_creator', '/create', '/create'],
    ['school_admin', '/analytics', '/analytics'],
    ['tenant', '/localize', '/localize'],
    ['textbook_remediation_volunteer', '/library', '/jobs'],
    ['textbook_remediation_volunteer', '/home', '/jobs'],
    ['textbook_remediation_volunteer', '/review', '/review'],
  ])('%s navigating to %s lands on %s', async (role, to, landed) => {
    useAuthStore.setState({ role });
    await router.navigate({ to: '/home' });
    await router.navigate({ to });
    expect(router.state.location.pathname).toBe(landed);
  });
});
