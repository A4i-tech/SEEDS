// @ts-check

class LoginPage {
  constructor(page) {
    this.page = page;
    this.phoneInput = page.locator('[aria-label="Phone number input"] input');
    this.passwordInput = page.locator('[aria-label="Password input"] input');
    this.submitButton = page.getByRole('button', { name: 'Login' });
  }

  async goto() {
    await this.page.goto('/');
    await this.phoneInput.waitFor();
  }

  async login(phoneNumber, password) {
    await this.goto();
    await this.phoneInput.fill(phoneNumber);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}

module.exports = { LoginPage };
