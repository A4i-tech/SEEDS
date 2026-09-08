// @ts-check

class TeachersPage {
  constructor(page) {
    this.page = page;
    this.registrationTab = page.getByRole('button', { name: 'Registration' });
    this.roleSelect = page.locator('#teacher-role');
    this.nameInput = page.locator('#teacher-name');
    this.phoneInput = page.locator('#teacher-phone');
    this.passwordInput = page.locator('#teacher-password');
    this.saveButton = page.getByRole('button', { name: 'Save Teacher' });
    this.editNameInput = page.locator('#edit-teacher-name');
    this.editPhoneInput = page.locator('#edit-teacher-phone');
    this.editSaveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.transferSchoolSelect = page.locator('#transfer-school-id');
    this.transferButton = page.locator('.modal-actions').getByRole('button', { name: 'Transfer', exact: true });
  }

  async open() {
    // useTeachers.js shares one `isLoading` flag between the initial teacher-list
    // fetch and register-submission — submitting while the list fetch is still in
    // flight silently no-ops (no request, no message). Arm the wait for the
    // table's own GET before clicking, so it can't resolve too early or miss it.
    const teachersFetched = this.page
      .waitForResponse((res) => res.url().includes('/school/teachers') && res.ok(), { timeout: 10000 })
      .catch(() => {});
    await this.registrationTab.click();
    await this.nameInput.waitFor();
    await teachersFetched;
  }

  async register({ name, phone, password, role = 'teacher' }) {
    await this.roleSelect.selectOption(role);
    await this.nameInput.fill(name);
    await this.phoneInput.fill(phone);
    await this.passwordInput.fill(password);
    await this.saveButton.click();
  }

  row(phone) {
    return this.page.locator('tr', { has: this.page.getByText(phone, { exact: true }) });
  }

  async editTeacher(phone) {
    await this.row(phone).getByRole('button', { name: 'Edit' }).click();
    await this.editNameInput.waitFor();
  }

  async saveEdit(name) {
    await this.editNameInput.fill(name);
    await this.editSaveButton.click();
  }

  async deleteTeacher(phone) {
    this.page.once('dialog', (dialog) => dialog.accept());
    await this.row(phone).getByRole('button', { name: 'Remove' }).click();
  }

  async transferTeacher(phone, targetSchoolName) {
    await this.row(phone).getByRole('button', { name: 'Transfer' }).click();
    await this.transferSchoolSelect.waitFor();
    await this.transferSchoolSelect.selectOption({ label: targetSchoolName });
    await this.transferButton.click();
  }
}

module.exports = { TeachersPage };
