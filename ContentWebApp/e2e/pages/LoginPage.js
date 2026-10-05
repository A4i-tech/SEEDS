// @ts-check

class LoginPage {
  constructor(page) {
    this.page = page;
    this.identifierInput = page.locator('#login-identifier');
    this.passwordInput = page.locator('#login-password');
    this.submitButton = page.locator('button[type="submit"]');
  }

  async goto() {
    await this.page.goto('/');
    await this.identifierInput.waitFor();
  }

  async login(identifier, password) {
    await this.goto();
    await this.identifierInput.fill(identifier);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}

module.exports = { LoginPage };
