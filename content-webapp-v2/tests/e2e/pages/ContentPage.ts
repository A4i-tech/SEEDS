import type { Page } from '@playwright/test';

export class ContentPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async waitForLoad(): Promise<void> {
    // Legacy only waited (login auto-landed on /content). v2 login lands on
    // /home, so navigate to the library explicitly — the v2 /content route.
    await this.page.goto('/library');
    await this.page.waitForURL(/\/library/, { timeout: 15000 });
    await this.page.getByPlaceholder(/Search by title/i).waitFor({ timeout: 15000 });
  }
}
