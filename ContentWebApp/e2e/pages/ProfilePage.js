// @ts-check

class ProfilePage {
  constructor(page) {
    this.page = page;
    this.currentPasswordInput = page.locator('#current-password');
    this.newPasswordInput = page.locator('#new-password');
    this.confirmPasswordInput = page.locator('#confirm-password');
    this.submitButton = page.getByRole('button', { name: /update password/i });
  }

  async goto() {
    await this.page.goto('/profile');
    await this.currentPasswordInput.waitFor();
  }

  async changePassword(currentPassword, newPassword, confirmPassword) {
    await this.currentPasswordInput.fill(currentPassword);
    await this.newPasswordInput.fill(newPassword);
    await this.confirmPasswordInput.fill(confirmPassword);
    await this.submitButton.click();
  }
}

module.exports = { ProfilePage };
