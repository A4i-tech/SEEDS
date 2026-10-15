// @ts-check

class ClassroomDetailPage {
  constructor(page) {
    this.page = page;
    this.editButton = page.getByRole('button', { name: 'Edit Classroom' });
    this.startConferenceButton = page.getByRole('button', { name: 'Start Conference' });
  }

  async goto(classroomId) {
    await this.page.goto(`/classrooms/detail/${classroomId}`);
    await this.editButton.waitFor();
  }

  studentListItem(studentName) {
    return this.page.locator('.MuiListItem-root', { hasText: studentName });
  }

  studentCheckbox(studentName) {
    return this.studentListItem(studentName).getByRole('checkbox');
  }

  async toggleStudent(studentName) {
    await this.studentListItem(studentName).click();
  }

  async startConference() {
    await this.startConferenceButton.click();
  }
}

module.exports = { ClassroomDetailPage };
