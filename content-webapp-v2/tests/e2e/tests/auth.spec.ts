import { expect, test } from '@playwright/test';
import { PERSONAS } from '../fixtures/instances';
import { LoginPage } from '../pages/LoginPage';
import { ContentPage } from '../pages/ContentPage';
import { RegisterPage } from '../pages/RegisterPage';
import { HeaderPage } from '../pages/HeaderPage';
import { ProfilePage } from '../pages/ProfilePage';

// Route/label deltas vs legacy (ContentWebApp/e2e/tests/auth.spec.js):
// - post-login landing is /home, not /content (router redirects auth '/' -> /home)
// - logout lands on '/' (login), whose URL carries ?redirect=%2Fhome — assert
//   pathname, not a /$/ regex
// - failure surfaces are Mantine Alerts (role="alert", backend error.message),
//   not legacy's fixed strings — assert the alert, not exact copy
// - password change moved to /account/settings with no confirm field and success
//   copy "Password changed successfully." (see ProfilePage delta)
//
// NOTE on ContentPage: tests/e2e/pages/ContentPage.ts is owned by the sibling
// content specs — its waitForLoad() navigates to /library explicitly. TC-AUTH-001
// and TC-AUTH-010 therefore assert the /home landing BEFORE calling waitForLoad
// (which would navigate away and invalidate the pathname assertion).

// IDEMPOTENCY / CONCURRENCY NOTE: TC-AUTH-007/008 mutate PERSONAS.tenantPasswordTest,
// a persona dedicated to those two tests (see fixtures/instances.ts) — not
// PERSONAS.tenant, which every other test/file in this suite logs in as. That
// change removed the specific cross-file race that motivated workers: 1 in
// playwright.config.ts. This file is still forced serial internally because tests
// within it aren't otherwise ordering-independent (keeping this file's own tests
// serial avoids relying on that being airtight before it's been proven live at
// the config level).
test.describe.configure({ mode: 'serial' });

test('TC-AUTH-001 tenant login with valid credentials redirects to /home', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);

  await loginPage.login(PERSONAS['tenant']!.identifier, PERSONAS['tenant']!.password);
  await page.waitForURL('**/home', { timeout: 15000 });
  expect(new URL(page.url()).pathname).toBe('/home');
  await contentPage.waitForLoad();
});

test('TC-AUTH-002 tenant login with invalid credentials fails with an error', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.login('random@random.com', 'Random@123');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).not.toBe('/home');
});

// Read-only against the tenant fixture: registration is rejected before any write happens,
// so this is safe to rerun as-is.
// DELTA: legacy asserted the fixed string 'Failed to register. Please try again.';
// v2 surfaces the backend error.message in the Alert — assert visibility only.
test('TC-AUTH-004 tenant registration fails for an existing email with a different password', async ({ page }) => {
  const registerPage = new RegisterPage(page);

  await registerPage.register('existing-tenant-retry', PERSONAS['tenant']!.identifier, 'Test@321');

  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
});

test('TC-AUTH-006 tenant logout after login navigates back to the login page', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);
  const header = new HeaderPage(page);

  await loginPage.login(PERSONAS['tenant']!.identifier, PERSONAS['tenant']!.password);
  await contentPage.waitForLoad();

  await header.logout();

  // expect(page.url()) has no auto-retry, unlike expect(page).toHaveURL() —
  // the redirect after logout isn't necessarily synchronous with the token
  // being cleared, so a one-shot check can catch a stale URL mid-navigation.
  // v2 login URL carries ?redirect=%2Fhome, so assert pathname, not /$/.
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 10000 }).toBe('/');
});

test('TC-AUTH-011 school login with invalid credentials fails with an error', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.login('random@test-a4i.local', 'Random@123');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).not.toBe('/home');
});

// TC-AUTH-007/008/009: tenant password change
// IDEMPOTENCY NOTE: TC-AUTH-007/008 mutate PERSONAS.tenantPasswordTest (Test@123 ->
// Test@321 and back), a persona no other spec in this suite touches — see
// fixtures/instances.ts. Do not remove the restore step; do not switch these two
// back to PERSONAS.tenant.
test.describe('tenant password change', () => {
  // Self-healing: if a prior run got cancelled or failed between changing the
  // password and restoring it, the account is left on `changed` — logging in
  // with the canonical password would then fail every run after. Try the
  // canonical password first, fall back to `changed`, and restore in a
  // finally so an assertion failure mid-test still leaves the account clean.
  test('TC-AUTH-007 succeeds with the correct current password, then restores it', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const profilePage = new ProfilePage(page);
    const canonical = PERSONAS['tenantPasswordTest']!.password;
    const changedPassword = 'Test@321';

    let current = canonical;
    try {
      await loginPage.login(PERSONAS['tenantPasswordTest']!.identifier, canonical);
      await contentPage.waitForLoad();
    } catch {
      await loginPage.login(PERSONAS['tenantPasswordTest']!.identifier, changedPassword);
      await contentPage.waitForLoad();
      current = changedPassword;
    }
    await profilePage.goto();

    try {
      if (current === canonical) {
        await profilePage.changePassword(canonical, changedPassword, changedPassword);
        await expect(page.getByText(/password changed successfully/i)).toBeVisible({ timeout: 10000 });
        current = changedPassword;
      }
    } finally {
      if (current === changedPassword) {
        await profilePage.goto();
        await profilePage.changePassword(changedPassword, canonical, canonical);
        await expect(page.getByText(/password changed successfully/i)).toBeVisible({ timeout: 10000 });
      }
    }
  });

  // PRODUCT GAP: backend rejects with "Current password is incorrect" but the
  // app treats any non-login 401 as session expiry (apiClient) — the inline
  // error never surfaces; token is wiped and the user lands on login.
  // No restore step needed — a rejected change never takes effect.
  test('TC-AUTH-008 fails with an incorrect current password', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const profilePage = new ProfilePage(page);
    const wrongCurrentPassword = 'Test@321';
    const attemptedNewPassword = 'Test@4321';

    await loginPage.login(PERSONAS['tenantPasswordTest']!.identifier, PERSONAS['tenantPasswordTest']!.password);
    await contentPage.waitForLoad();
    await profilePage.goto();

    await profilePage.changePassword(wrongCurrentPassword, attemptedNewPassword, attemptedNewPassword);
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 10000 }).toBe('/');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('seeds.auth.token')), { timeout: 10000 }).toBeNull();
  });

  // DELTA: legacy TC-AUTH-009 asserted "New passwords don't match" from a
  // confirm-password field that does not exist in v2's /account/settings (zod
  // requires current_password + new_password only). Closest v2 equivalent:
  // submitting with an empty new password is blocked client-side — no success
  // text, still on /account/settings.
  test("TC-AUTH-009 fails when the new password is empty", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const profilePage = new ProfilePage(page);

    await loginPage.login(PERSONAS['tenant']!.identifier, PERSONAS['tenant']!.password);
    await contentPage.waitForLoad();
    await profilePage.goto();

    await profilePage.currentPasswordInput.fill(PERSONAS['tenant']!.password);
    await profilePage.submitButton.click();
    await expect(page.getByText('Password changed successfully.')).toBeHidden({ timeout: 10000 });
    expect(new URL(page.url()).pathname).toBe('/account/settings');
  });
});

test('TC-AUTH-010 school login with valid credentials redirects to /home', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);

  await loginPage.login(PERSONAS['school']!.identifier, PERSONAS['school']!.password);
  await page.waitForURL('**/home', { timeout: 15000 });
  expect(new URL(page.url()).pathname).toBe('/home');
  await contentPage.waitForLoad();
});
