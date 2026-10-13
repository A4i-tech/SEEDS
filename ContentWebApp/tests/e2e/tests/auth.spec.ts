import { expect, test } from '@playwright/test';
import { PERSONAS } from '../fixtures/instances';
import { gotoLibrary, login } from '../helpers';

test.describe.configure({ mode: 'serial' });

test('TC-AUTH-001 tenant login with valid credentials redirects to /home', async ({ page }) => {
  await login(page, PERSONAS['tenant']!.identifier, PERSONAS['tenant']!.password);
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
  await page.goto('/register');
  await page.getByLabel('Organization name *', { exact: true }).fill('existing-tenant-retry');
  await page.getByLabel('Email *', { exact: true }).fill(PERSONAS['tenant']!.identifier);
  await page.locator('input[type="password"]').nth(0).fill('Test@321');
  await page.locator('input[type="password"]').nth(1).fill('Test@321');
  await page.locator('button[type="submit"]').click();

  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
});

test('TC-AUTH-006 tenant logout after login navigates back to the login page', async ({ page }) => {
  await login(page, PERSONAS['tenant']!.identifier, PERSONAS['tenant']!.password);
  await gotoLibrary(page);

  let cleared = false;
  for (let attempt = 1; attempt <= 3 && !cleared; attempt++) {
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
    cleared = await page
      .waitForFunction(() => !localStorage.getItem('seeds.auth.token'), { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!cleared) throw new Error('logout: seeds.auth.token still present after 3 attempts');

  await expect.poll(() => new URL(page.url()).pathname, { timeout: 10000 }).toBe('/');
});

test('TC-AUTH-011 school login with invalid credentials fails with an error', async ({ page }) => {
  await login(page, 'random@test-a4i.local', 'Random@123');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).not.toBe('/home');
});

test.describe('tenant password change', () => {
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
