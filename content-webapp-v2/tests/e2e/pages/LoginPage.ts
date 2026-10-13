import type { Locator, Page } from '@playwright/test';

// Mantine PasswordInput renders a "Toggle password visibility" button whose
// accessible name also contains "password", so getByLabel('Password') is ambiguous — match the input directly.
export class LoginPage {
  readonly page: Page;
  readonly identifierInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.identifierInput = page.getByLabel(/phone number or email/i);
    this.passwordInput = page.locator('input[type="password"]');
    this.submitButton = page.getByRole('button', { name: 'Log in', exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.identifierInput.waitFor();
  }

  async login(identifier: string, password: string): Promise<void> {
    await this.goto();
    await this.identifierInput.fill(identifier);
    await this.passwordInput.fill(password);
    // Await the /auth/login round-trip before returning: callers navigate right
    // after (e.g. ContentPage.waitForLoad), which would abort the in-flight
    // POST and bounce back to the login page. Resolves on error statuses too —
    // invalid-credential callers assert the alert themselves.
    const loginResponded = this.page.waitForResponse(
      (res) => res.url().includes('/auth/login') && res.request().method() === 'POST',
    );
    await this.submitButton.click();
    await loginResponded;
  }
}
