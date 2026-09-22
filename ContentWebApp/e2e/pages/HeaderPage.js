// @ts-check

class HeaderPage {
  constructor(page) {
    this.page = page;
    this.welcomeText = page.locator('.welcome-text');
    this.avatarTrigger = page.locator('.user-info-wrapper');
    this.profileMenuItem = page.getByRole('button', { name: 'Profile' });
    this.logoutMenuItem = page.getByRole('button', { name: 'Logout' });
  }

  async openDropdown() {
    await this.avatarTrigger.click();
  }

  async logout() {
    // Retries the whole open-dropdown-then-click sequence, not just the
    // click, if the session isn't actually cleared afterward. Confirmed live:
    // logging out right after an action that triggers a list refetch (e.g.
    // TC-TCHR-006/TC-CC-005's transfer) can have the click land without
    // effect — the avatar/dropdown likely re-rendered between locating and
    // clicking it, a UI race rather than a genuinely slow/broken logout
    // (isolated logout-immediately-after-login was reliably instant in the
    // same environment). A caller that proceeds to log in as someone else
    // while still authenticated gets redirected straight back to /content by
    // the "already authenticated" guard and hangs waiting for a login form
    // that will never appear — so this must not return until the token is
    // actually gone.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.openDropdown();
      await this.logoutMenuItem.click();
      const cleared = await this.page
        .waitForFunction(() => !localStorage.getItem('authToken'), { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (cleared) return;
    }
    throw new Error('HeaderPage.logout(): authToken still present after 3 attempts');
  }

  async goToProfile() {
    await this.openDropdown();
    await this.profileMenuItem.click();
  }
}

module.exports = { HeaderPage };
