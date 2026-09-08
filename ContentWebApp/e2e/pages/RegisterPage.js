// @ts-check

class RegisterPage {
  constructor(page) {
    this.page = page;
    this.tenantNameInput = page.locator('#tenantName');
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.confirmPasswordInput = page.locator('#confirm-password');
    // The tab-switcher above the form is also labelled "Sign Up" — scope to the submit button.
    this.submitButton = page.locator('button[type="submit"]');
  }

  async goto() {
    await this.page.goto('/register');
    await this.tenantNameInput.waitFor();
  }

  async register(tenantName, email, password, confirmPassword = password) {
    await this.goto();
    await this.tenantNameInput.fill(tenantName);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(confirmPassword);
    await this.submitButton.click();
  }
}

module.exports = { RegisterPage };
