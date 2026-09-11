// @ts-check
const { test, expect } = require('@playwright/test');
const { PERSONAS } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ContentPage } = require('../pages/ContentPage');
const { RegisterPage } = require('../pages/RegisterPage');
const { HeaderPage } = require('../pages/HeaderPage');
const { ProfilePage } = require('../pages/ProfilePage');

// IDEMPOTENCY / CONCURRENCY NOTE: TC-AUTH-007/008 mutate PERSONAS.tenantPasswordTest,
// a persona dedicated to those two tests (see fixtures/instances.js) — not
// PERSONAS.tenant, which every other test/file in this suite logs in as. That
// change removed the specific cross-file race that motivated workers: 1 in
// playwright.config.js. This file is still forced serial internally because tests
// within it aren't otherwise ordering-independent (e.g. TC-AUTH-001 running
// alongside 007/008 in a different worker is now safe, but keeping this file's
// own tests serial avoids relying on that being airtight before it's been proven
// live at the config level).
test.describe.configure({ mode: 'serial' });

// TC-AUTH-001: Verify tenant login with valid credentials
test('TC-AUTH-001 tenant login with valid credentials redirects to /content', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);

  await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await contentPage.waitForLoad();

  expect(new URL(page.url()).pathname).toBe('/content');
});

// TC-AUTH-002: Verify tenant login with invalid credentials
test('TC-AUTH-002 tenant login with invalid credentials fails with an error', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.login('random@random.com', 'Random@123');
  await expect(page.getByText(/invalid|failed|error/i)).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).not.toBe('/content');
});

// TC-AUTH-004: Verify tenant registration fails for an existing email with a different password
// Read-only against the tenant fixture: registration is rejected before any write happens,
// so this is safe to rerun as-is.
test('TC-AUTH-004 tenant registration fails for an existing email with a different password', async ({ page }) => {
  const registerPage = new RegisterPage(page);

  await registerPage.register('existing-tenant-retry', PERSONAS.tenant.identifier, 'Test@321');

  await expect(page.getByText('Failed to register. Please try again.')).toBeVisible({ timeout: 10000 });
});

// TC-AUTH-006: Verify tenant logout after login
test('TC-AUTH-006 tenant logout after login navigates back to the homepage', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);
  const header = new HeaderPage(page);

  await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await contentPage.waitForLoad();

  await header.logout();

  // expect(page.url()) has no auto-retry, unlike expect(page).toHaveURL() —
  // the redirect after logout isn't necessarily synchronous with the token
  // being cleared, so a one-shot check can catch a stale URL mid-navigation.
  await expect(page).toHaveURL(/\/$/, { timeout: 10000 });
});

// TC-AUTH-011: Verify school login with invalid credentials
test('TC-AUTH-011 school login with invalid credentials fails with an error', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.login('random@test-a4i.local', 'Random@123');
  await expect(page.getByText(/invalid|failed|error/i)).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).not.toBe('/content');
});

// TC-AUTH-007/008/009: tenant password change
// IDEMPOTENCY NOTE: TC-AUTH-007/008 mutate PERSONAS.tenantPasswordTest (Test@123 ->
// Test@321 and back), a persona no other spec in this suite touches — see
// fixtures/instances.js. Do not remove the restore step; do not switch these two
// back to PERSONAS.tenant.
test.describe('tenant password change', () => {
  test('TC-AUTH-007 succeeds with the correct current password, then restores it', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const header = new HeaderPage(page);
    const profilePage = new ProfilePage(page);
    const changedPassword = 'Test@321';

    await loginPage.login(PERSONAS.tenantPasswordTest.identifier, PERSONAS.tenantPasswordTest.password);
    await contentPage.waitForLoad();
    await header.goToProfile();
    await profilePage.goto();

    await profilePage.changePassword(PERSONAS.tenantPasswordTest.password, changedPassword, changedPassword);
    await expect(page.getByText(/password updated successfully/i)).toBeVisible({ timeout: 10000 });

    // Restore: the session is still valid after a password change (it doesn't force a
    // re-login), so just go back to the profile form and change it back, so every other
    // spec in the suite can keep assuming PERSONAS.tenantPasswordTest.password is valid.
    await profilePage.goto();
    await profilePage.changePassword(changedPassword, PERSONAS.tenantPasswordTest.password, PERSONAS.tenantPasswordTest.password);
    await expect(page.getByText(/password updated successfully/i)).toBeVisible({ timeout: 10000 });
  });

  // Was previously a confirmed bug (POST /tenant/change-password didn't validate
  // current_password server-side — see #592) that this test documented by asserting
  // the buggy behavior. Verified live 2026-09-10 against dev: the backend now
  // correctly rejects with "Current password is incorrect", matching the doc's
  // original expected outcome (docmost.a4i-lab.in/s/seeds/p/seeds-test-cases-54bIGOBUUJ).
  // No restore step needed — a rejected change never takes effect.
  test('TC-AUTH-008 fails with an incorrect current password', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const header = new HeaderPage(page);
    const profilePage = new ProfilePage(page);
    const wrongCurrentPassword = 'Test@321';
    const attemptedNewPassword = 'Test@4321';

    await loginPage.login(PERSONAS.tenantPasswordTest.identifier, PERSONAS.tenantPasswordTest.password);
    await contentPage.waitForLoad();
    await header.goToProfile();
    await profilePage.goto();

    await profilePage.changePassword(wrongCurrentPassword, attemptedNewPassword, attemptedNewPassword);
    await expect(page.getByText('Current password is incorrect')).toBeVisible({ timeout: 10000 });
  });

  test("TC-AUTH-009 fails when new password and confirmation don't match", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const header = new HeaderPage(page);
    const profilePage = new ProfilePage(page);

    await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await contentPage.waitForLoad();
    await header.goToProfile();
    await profilePage.goto();

    await profilePage.changePassword(PERSONAS.tenant.password, 'Test@321', 'Test@123');
    await expect(page.getByText("New passwords don't match")).toBeVisible({ timeout: 10000 });
  });
});

// TC-AUTH-010: Verify school login with valid credentials
test('TC-AUTH-010 school login with valid credentials redirects to /content', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);

  await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
  await contentPage.waitForLoad();

  expect(new URL(page.url()).pathname).toBe('/content');
});
