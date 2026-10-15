// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueClassroomName } = require('../../fixtures/instances');
const { ClassroomListPage } = require('../../pages/ClassroomListPage');
const { ClassroomFormPage } = require('../../pages/ClassroomFormPage');
const { ClassroomDetailPage } = require('../../pages/ClassroomDetailPage');

test.describe.configure({ mode: 'serial' });

async function createClassroomWithStudents(page, count) {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);

  const studentNames = [];
  for (let i = 0; i < count; i++) {
    const label = await classroomFormPage.addFirstAvailableStudent();
    if (!label) break;
    studentNames.push(label.split(' - ')[0]);
  }

  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();
  return { name, studentNames };
}

// TC-TCONF-001: Verify selecting a single student for conference
test('TC-TCONF-001 selecting a single student for conference marks it selected', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  const { name, studentNames } = await createClassroomWithStudents(page, 1);
  test.skip(studentNames.length < 1, 'No students registered for this teacher account to verify selection');

  await classroomListPage.viewClassroom(name);
  await classroomDetailPage.editButton.waitFor();

  await expect(classroomDetailPage.studentCheckbox(studentNames[0])).not.toBeChecked();
  await classroomDetailPage.toggleStudent(studentNames[0]);
  await expect(classroomDetailPage.studentCheckbox(studentNames[0])).toBeChecked();
});

// TC-TCONF-002: Verify selecting multiple students for conference
test('TC-TCONF-002 selecting multiple students for conference marks all selected', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  const { name, studentNames } = await createClassroomWithStudents(page, 2);
  test.skip(studentNames.length < 2, 'Fewer than 2 students registered for this teacher account to verify multi-select');

  await classroomListPage.viewClassroom(name);
  await classroomDetailPage.editButton.waitFor();

  for (const studentName of studentNames) {
    await classroomDetailPage.toggleStudent(studentName);
  }
  for (const studentName of studentNames) {
    await expect(classroomDetailPage.studentCheckbox(studentName)).toBeChecked();
  }
});

// TC-TCONF-003: Verify Start Conference button state before/after selecting students
test('TC-TCONF-003 Start Conference button is disabled until a student is selected', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  const { name, studentNames } = await createClassroomWithStudents(page, 1);
  test.skip(studentNames.length < 1, 'No students registered for this teacher account to verify button state');

  await classroomListPage.viewClassroom(name);
  await classroomDetailPage.editButton.waitFor();

  await expect(classroomDetailPage.startConferenceButton).toBeDisabled();
  await classroomDetailPage.toggleStudent(studentNames[0]);
  await expect(classroomDetailPage.startConferenceButton).toBeEnabled();
});
