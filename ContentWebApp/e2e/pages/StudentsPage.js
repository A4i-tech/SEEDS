// @ts-check

// StudentsSection.js never renders the flash message useTeachers.js produces for
// add/update/delete (unlike SchoolsPanel/TeacherRegistrationForm, which do) — a
// real UI gap, not a test bug. Every mutating method here returns the actual HTTP
// status of the underlying request instead, since that's the only reliable signal
// available for asserting success/failure.
class StudentsPage {
  constructor(page) {
    this.page = page;
    this.registrationTab = page.getByRole('button', { name: 'Registration' });
    this.studentsSubTab = page.getByRole('button', { name: 'Students', exact: true });
    this.nameInput = page.locator('#student-name');
    this.phoneInput = page.locator('#student-phone');
    this.addButton = page.getByRole('button', { name: 'Add Student' });
    this.editNameInput = page.locator('#edit-student-name');
    this.editPhoneInput = page.locator('#edit-student-phone');
    this.editSaveButton = page.getByRole('button', { name: 'Save', exact: true });
  }

  async open() {
    // Same fix as TeachersPage.open(): don't return before the students list
    // GET has actually resolved — a caller that checks for a row immediately
    // after can otherwise race the fetch (confirmed live on a slower/remote
    // instance: row(phone) not found even though the student genuinely
    // existed, because the list simply hadn't loaded yet).
    const studentsFetched = this.page
      .waitForResponse((res) => res.url().endsWith('/student') && res.request().method() === 'GET', { timeout: 10000 })
      .catch(() => {});
    await this.registrationTab.click();
    await this.studentsSubTab.click();
    await this.nameInput.waitFor();
    await studentsFetched;
  }

  async addStudent(name, phone) {
    const response = this.page.waitForResponse(
      (res) => res.url().endsWith('/student') && res.request().method() === 'POST'
    );
    await this.nameInput.fill(name);
    await this.phoneInput.fill(phone);
    await this.addButton.click();
    return (await response).status();
  }

  row(phone) {
    return this.page.locator('tr', { has: this.page.getByText(phone, { exact: true }) });
  }

  async editStudent(phone) {
    await this.row(phone).getByRole('button', { name: 'Edit' }).click();
    await this.editNameInput.waitFor();
  }

  async saveEditName(name) {
    const response = this.page.waitForResponse(
      (res) => /\/student\//.test(res.url()) && res.request().method() === 'PATCH'
    );
    await this.editNameInput.fill(name);
    await this.editSaveButton.click();
    return (await response).status();
  }

  async saveEditPhone(phone) {
    const response = this.page.waitForResponse(
      (res) => /\/student\//.test(res.url()) && res.request().method() === 'PATCH'
    );
    await this.editPhoneInput.fill(phone);
    await this.editSaveButton.click();
    return (await response).status();
  }

  async deleteStudent(phone) {
    // No confirmation dialog on delete for students (confirmed in source:
    // useTeachers.js's deleteStudentById has no window.confirm, unlike
    // deleteTeacher/deleteSchool) — nothing to accept here.
    const response = this.page.waitForResponse(
      (res) => /\/student\//.test(res.url()) && res.request().method() === 'DELETE'
    );
    await this.row(phone).getByRole('button', { name: 'Remove' }).click();
    return (await response).status();
  }
}

module.exports = { StudentsPage };
