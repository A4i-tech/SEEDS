// @ts-check

class SchoolsPage {
  constructor(page) {
    this.page = page;
    this.registrationTab = page.getByRole('button', { name: 'Registration' });
    this.nameInput = page.locator('#school-name');
    this.emailInput = page.locator('#school-email');
    this.passwordInput = page.locator('#school-password');
    this.createButton = page.getByRole('button', { name: 'Create School' });
    this.editNameInput = page.locator('#edit-school-name');
    this.editEmailInput = page.locator('#edit-school-email');
    this.saveButton = page.getByRole('button', { name: 'Save' });
  }

  async open() {
    await this.registrationTab.click();
    await this.nameInput.waitFor();
  }

  async createSchool(name, email, password) {
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.createButton.click();
  }

  row(email) {
    return this.page.locator('tr', { has: this.page.getByText(email, { exact: true }) });
  }

  async editSchool(email) {
    await this.row(email).getByRole('button', { name: 'Edit' }).click();
    await this.editNameInput.waitFor();
  }

  async saveEdit(name) {
    await this.editNameInput.fill(name);
    await this.saveButton.click();
  }

  async deleteSchool(email) {
    this.page.once('dialog', (dialog) => dialog.accept());
    await this.row(email).getByRole('button', { name: 'Delete' }).click();
  }
}

module.exports = { SchoolsPage };
