import type { Locator, Page } from '@playwright/test';

// DELTA vs legacy: v2 splits the old /profile screen in two — read-only account
// display at /account/profile (AccountProfileScreen) and password change at
// /account/settings (AccountSettingsScreen), which has NO confirm-password
// field (zod requires current_password + new_password only) and reports success
// as "Password changed successfully." via account.passwordSaved. This POM covers
// the settings screen; changePassword keeps its 3-arg name with the third arg
// optional-and-ignored so call sites keep their shape. TC-AUTH-009 (mismatch)
// has no v2 counterpart — see auth.spec.ts.
export class ProfilePage {
  readonly page: Page;
  readonly currentPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // getByLabel('...password') also matches the visibility-toggle button — nth() follows AccountSettingsScreen field order (current, new).
    this.currentPasswordInput = page.locator('input[type="password"]').nth(0);
    this.newPasswordInput = page.locator('input[type="password"]').nth(1);
    this.submitButton = page.getByRole('button', { name: 'Save new password', exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto('/account/settings');
    await this.currentPasswordInput.waitFor();
  }

  async changePassword(currentPassword: string, newPassword: string, _confirmPassword?: string): Promise<void> {
    await this.currentPasswordInput.fill(currentPassword);
    await this.newPasswordInput.fill(newPassword);
    await this.submitButton.click();
  }
}
