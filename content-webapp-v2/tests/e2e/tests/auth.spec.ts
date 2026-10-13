import { expect, test } from '@playwright/test';
import { PERSONAS } from '../fixtures/instances';
import { gotoLibrary, login } from '../helpers';

// Route/label deltas vs legacy ContentWebApp/e2e/tests/auth.spec.js:
// - post-login landing is /home (router redirects auth '/' -> /home)
// - logout lands on '/' with the login URL carrying ?redirect=%2Fhome — assert
//   pathname, not a /$/ regex
// - failure surfaces are Mantine Alerts (role="alert", backend error.message),
//   not legacy's fixed strings — assert the alert, not exact copy
// - password change moved to /account/settings with no confirm field and success
//   copy "Password changed successfully."
//
// IDEMPOTENCY: TC-AUTH-007/008 mutate PERSONAS.tenantPasswordTest, a persona
// dedicated to those two tests — not PERSONAS.tenant, which every other test/file
// in this suite logs in as. This file stays forced serial internally because its
// tests aren't otherwise ordering-independent.
test.describe.configure({ mode: 'serial' });

test('TC-AUTH-001 tenant login with valid credentials redirects to /home', async ({ page }) => {
  await login(page, PERSONAS['tenant']!.identifier, PERSONAS['tenant']!.password);
  // Assert the /home landing before gotoLibrary, which navigates away to /library.
  await page.waitForURL('**/home', { timeout: 15000 });
  expect(new URL(page.url()).pathname).toBe('/home');
  await gotoLibrary(page);
});

test('TC-AUTH-002 tenant login with invalid credentials fails with an error', async ({ page }) => {
  await login(page, 'random@random.com', 'Random@123');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).not.toBe('/home');
});

test('TC-AUTH-004 tenant registration fails for an existing email with a different password', async ({ page }) => {
  // Read-only against the tenant fixture: registration is rejected before any write.
  await page.goto('/register');
  // Labels carry a literal ' *' suffix.
  await page.getByLabel('Organization name *', { exact: true }).fill('existing-tenant-retry');
  await page.getByLabel('Email *', { exact: true }).fill(PERSONAS['tenant']!.identifier);
  // getByLabel('Password') also matches the visibility-toggle button — nth() follows RegisterScreen field order (password, confirm).
  await page.locator('input[type="password"]').nth(0).fill('Test@321');
  await page.locator('input[type="password"]').nth(1).fill('Test@321');
  // The tab-switcher above the form is also labelled "Sign up" — scope to the submit button.
  await page.locator('button[type="submit"]').click();

  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
});

test('TC-AUTH-006 tenant logout after login navigates back to the login page', async ({ page }) => {
  await login(page, PERSONAS['tenant']!.identifier, PERSONAS['tenant']!.password);
  await gotoLibrary(page);

  // Race guard: retries the whole open-dropdown-then-confirm sequence, not just
  // the click, if the session isn't actually cleared. A caller that proceeds to
  // log in as someone else while still authenticated gets redirected straight
  // back to /home by the "already authenticated" guard and hangs — so logout must
  // not return until seeds.auth.token (useAuthStore TOKEN_KEY) is gone.
  let cleared = false;
  for (let attempt = 1; attempt <= 3 && !cleared; attempt++) {
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    // The confirm button is also labelled "Sign out" — scope the click to the dialog.
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
    cleared = await page
      .waitForFunction(() => !localStorage.getItem('seeds.auth.token'), { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!cleared) throw new Error('logout: seeds.auth.token still present after 3 attempts');

  // expect(page.url()) has no auto-retry — the redirect after logout isn't
  // necessarily synchronous with the token clearing, so use expect.poll.
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 10000 }).toBe('/');
});

test('TC-AUTH-011 school login with invalid credentials fails with an error', async ({ page }) => {
  await login(page, 'random@test-a4i.local', 'Random@123');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).not.toBe('/home');
});

// TC-AUTH-007/008/009: tenant password change
// IDEMPOTENCY: these mutate PERSONAS.tenantPasswordTest (Test@123 -> Test@321 and
// back), a persona no other spec touches. Do not remove the restore step.
test.describe('tenant password change', () => {
  // Self-healing: if a prior run got cancelled between changing the password and
  // restoring it, the account is left on `changed` — try the canonical password
  // first, fall back to `changed`, and restore in a finally so an assertion
  // failure mid-test still leaves the account clean.
  test('TC-AUTH-007 succeeds with the correct current password, then restores it', async ({ page }) => {
    const canonical = PERSONAS['tenantPasswordTest']!.password;
    const changedPassword = 'Test@321';

    let current = canonical;
    try {
      await login(page, PERSONAS['tenantPasswordTest']!.identifier, canonical);
      await gotoLibrary(page);
    } catch {
      await login(page, PERSONAS['tenantPasswordTest']!.identifier, changedPassword);
      await gotoLibrary(page);
      current = changedPassword;
    }
    await page.goto('/account/settings');

    try {
      if (current === canonical) {
        await page.locator('input[type="password"]').nth(0).fill(canonical);
        await page.locator('input[type="password"]').nth(1).fill(changedPassword);
        await page.getByRole('button', { name: 'Save new password', exact: true }).click();
        await expect(page.getByText(/password changed successfully/i)).toBeVisible({ timeout: 10000 });
        current = changedPassword;
      }
    } finally {
      if (current === changedPassword) {
        await page.goto('/account/settings');
        await page.locator('input[type="password"]').nth(0).fill(changedPassword);
        await page.locator('input[type="password"]').nth(1).fill(canonical);
        await page.getByRole('button', { name: 'Save new password', exact: true }).click();
        await expect(page.getByText(/password changed successfully/i)).toBeVisible({ timeout: 10000 });
      }
    }
  });

  // PRODUCT GAP: backend rejects with "Current password is incorrect" but the app
  // treats any non-login 401 as session expiry — the inline error never surfaces;
  // token is wiped and the user lands on login. A rejected change never takes
  // effect, so no restore step is needed.
  test('TC-AUTH-008 fails with an incorrect current password', async ({ page }) => {
    const wrongCurrentPassword = 'Test@321';
    const attemptedNewPassword = 'Test@4321';

    await login(page, PERSONAS['tenantPasswordTest']!.identifier, PERSONAS['tenantPasswordTest']!.password);
    await gotoLibrary(page);
    await page.goto('/account/settings');

    await page.locator('input[type="password"]').nth(0).fill(wrongCurrentPassword);
    await page.locator('input[type="password"]').nth(1).fill(attemptedNewPassword);
    await page.getByRole('button', { name: 'Save new password', exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 10000 }).toBe('/');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('seeds.auth.token')), { timeout: 10000 }).toBeNull();
  });

  // PRODUCT GAP: legacy TC-AUTH-009 asserted "New passwords don't match" from a
  // confirm field that doesn't exist in v2 (zod requires current_password +
  // new_password only). Closest v2 equivalent: an empty new password is blocked
  // client-side — no success text, still on /account/settings.
  test("TC-AUTH-009 fails when the new password is empty", async ({ page }) => {
    await login(page, PERSONAS['tenant']!.identifier, PERSONAS['tenant']!.password);
    await gotoLibrary(page);
    await page.goto('/account/settings');

    await page.locator('input[type="password"]').nth(0).fill(PERSONAS['tenant']!.password);
    await page.getByRole('button', { name: 'Save new password', exact: true }).click();
    await expect(page.getByText('Password changed successfully.')).toBeHidden({ timeout: 10000 });
    expect(new URL(page.url()).pathname).toBe('/account/settings');
  });
});

test('TC-AUTH-010 school login with valid credentials redirects to /home', async ({ page }) => {
  await login(page, PERSONAS['school']!.identifier, PERSONAS['school']!.password);
  await page.waitForURL('**/home', { timeout: 15000 });
  expect(new URL(page.url()).pathname).toBe('/home');
  await gotoLibrary(page);
});
