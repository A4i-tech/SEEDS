// @ts-check

// #teacher-phone is React-controlled with a sanitize-on-every-keystroke
// onChange (PhoneNumberInput.js) — same class of race as StudentsPage.js's
// phone fields: Playwright's fill() can leave it stuck on the cleared empty
// value under load. Verify the fill actually landed before proceeding.
async function fillAndVerify(locator, value, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    await locator.fill(value);
    if ((await locator.inputValue()) === value) return;
  }
  throw new Error(`fillAndVerify: "${value}" didn't stick after ${attempts} attempts`);
}

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
    // Deliberately not swallowed: if this GET never resolves (timeout, broken
    // endpoint, API regression), fail here with a clear cause instead of letting
    // the caller pass or fail later on an unrelated, confusing assertion.
    const teachersFetched = this.page.waitForResponse(
      (res) => res.url().includes('/school/teachers'),
      { timeout: 10000 }
    );
    await this.registrationTab.click();
    await this.nameInput.waitFor();
    const res = await teachersFetched;
    if (!res.ok()) {
      throw new Error(`TeachersPage.open(): teachers list fetch failed with status ${res.status()}`);
    }
  }

  async register({ name, phone, password, role = 'teacher' }) {
    await this.roleSelect.selectOption(role);
    await this.nameInput.fill(name);
    await fillAndVerify(this.phoneInput, phone);
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
