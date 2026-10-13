import type { Page } from '@playwright/test';

export class RegisterPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/register');
    await this.page.getByLabel('Organization name *', { exact: true }).waitFor();
  }

  async register(
    tenantName: string,
    email: string,
    password: string,
    confirmPassword: string = password,
  ): Promise<void> {
    await this.goto();
    await this.page.getByLabel('Organization name *', { exact: true }).fill(tenantName);
    await this.page.getByLabel('Email *', { exact: true }).fill(email);
    // getByLabel('Password') also matches the visibility-toggle button — nth() follows RegisterScreen field order (password, confirm).
    await this.page.locator('input[type="password"]').nth(0).fill(password);
    await this.page.locator('input[type="password"]').nth(1).fill(confirmPassword);
    // The tab-switcher above the form is also labelled "Sign up" — scope to the submit button.
    await this.page.locator('button[type="submit"]').click();
  }
}
