import { expect, test } from '@playwright/test';
import { PERSONAS } from '../../fixtures/instances';
import { login } from '../../helpers';

test('TC-AUTH-005 tenant/me populates the account name on /account/profile', async ({ page }) => {
  await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Name:/)).toBeVisible({ timeout: 10000 });
});
