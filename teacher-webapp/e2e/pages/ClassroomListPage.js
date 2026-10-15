// @ts-check

class ClassroomListPage {
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'My Classrooms' });
    this.createClassroomButton = page.getByRole('button', { name: 'Create Classroom' });
    this.playContentButton = page.getByRole('button', { name: 'Play Content' });
    this.logoutButton = page.getByRole('button', { name: 'Logout' });
  }

  async goto() {
    await this.page.goto('/classrooms');
    await this.heading.waitFor();
  }

  classroomCard(name) {
    return this.page.locator('.MuiCard-root', { hasText: name });
  }

  async openCreate() {
    await this.createClassroomButton.click();
  }

  async viewClassroom(name) {
    await this.classroomCard(name).getByRole('button', { name: 'View' }).click();
  }

  async editClassroom(name) {
    await this.classroomCard(name).getByRole('button', { name: 'Edit' }).click();
  }

  async deleteClassroom(name) {
    await this.classroomCard(name).getByRole('button', { name: 'Delete' }).click();
    await this.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  }

  async logout() {
    await this.logoutButton.click();
  }
}

module.exports = { ClassroomListPage };
