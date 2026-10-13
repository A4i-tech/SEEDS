import type { Locator, Page } from '@playwright/test';

// v2 header (Shell, Mantine): no `.welcome-text` element exists anymore — the
// account menu is an UnstyledButton with aria-label "Account" opening a Menu
// with items Profile / Settings / Toggle theme / Sign out. "Sign out" opens a
// confirm modal whose confirm button is also labelled "Sign out", so logout
// scopes the confirm click to the dialog.
export class HeaderPage {
  readonly page: Page;
  readonly avatarTrigger: Locator;
  readonly profileMenuItem: Locator;
  readonly logoutMenuItem: Locator;

  constructor(page: Page) {
    this.page = page;
    this.avatarTrigger = page.getByRole('button', { name: 'Account', exact: true });
    this.profileMenuItem = page.getByRole('menuitem', { name: 'Profile', exact: true });
    this.logoutMenuItem = page.getByRole('menuitem', { name: 'Sign out', exact: true });
  }

  async openDropdown(): Promise<void> {
    await this.avatarTrigger.click();
  }

  async logout(): Promise<void> {
    // Retries the whole open-dropdown-then-click sequence, not just the
    // click, if the session isn't actually cleared afterward (see legacy
    // HeaderPage for the confirmed-live UI race this guards against). The v2
    // token lives under `seeds.auth.token` (useAuthStore TOKEN_KEY), not
    // legacy's `authToken`. A caller that proceeds to log in as someone else
    // while still authenticated gets redirected straight back to /home by the
    // "already authenticated" guard and hangs waiting for a login form that
    // will never appear — so this must not return until the token is gone.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.openDropdown();
      await this.logoutMenuItem.click();
      await this.page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
      const cleared = await this.page
        .waitForFunction(() => !localStorage.getItem('seeds.auth.token'), { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (cleared) return;
    }
    throw new Error('HeaderPage.logout(): seeds.auth.token still present after 3 attempts');
  }

  async goToProfile(): Promise<void> {
    await this.openDropdown();
    await this.profileMenuItem.click();
  }
}
