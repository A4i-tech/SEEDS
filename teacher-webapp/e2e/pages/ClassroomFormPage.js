// @ts-check

class ClassroomFormPage {
  constructor(page) {
    this.page = page;
    this.nameInput = page.getByLabel('Classroom Name');
    this.studentSearchInput = page.getByLabel('Search and Add Student');
    this.submitButton = page.getByRole('button', { name: /Create Classroom|Update Classroom/ });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
  }

  async gotoNew() {
    await this.page.goto('/classrooms/new');
    await this.nameInput.waitFor();
  }

  async fillName(name) {
    await this.nameInput.fill(name);
  }

  async addStudent(queryText, optionText) {
    await this.studentSearchInput.fill(queryText);
    await this.page.getByRole('option', { name: optionText }).click();
  }

  /**
   * Opens the student Autocomplete without typing a query and selects the
   * first available option. Returns the selected option's visible label
   * ("name - phone_number"), or null if no students are available for this
   * teacher account.
   */
  async addFirstAvailableStudent() {
    await this.studentSearchInput.click();
    const firstOption = this.page.getByRole('option').first();
    const hasOption = await firstOption.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasOption) {
      await this.page.keyboard.press('Escape');
      return null;
    }
    const label = (await firstOption.innerText()).trim();
    await firstOption.click();
    return label;
  }

  studentListItem(studentName) {
    return this.page.locator('.MuiListItem-root', { hasText: studentName });
  }

  async removeStudent(studentName) {
    await this.studentListItem(studentName).getByRole('button', { name: 'Remove student' }).click();
  }

  async submit() {
    await this.submitButton.click();
  }
}

module.exports = { ClassroomFormPage };
