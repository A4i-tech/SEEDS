// @ts-check
const { test, expect } = require('@playwright/test');
const { createClassroomWithStudents, cleanupClassrooms } = require('../../fixtures/classroomHelpers');
const { ClassroomListPage } = require('../../pages/ClassroomListPage');
const { ClassroomDetailPage } = require('../../pages/ClassroomDetailPage');

test.describe.configure({ mode: 'serial' });

test.afterEach(async ({ page }) => {
  await cleanupClassrooms(page);
});

test('TC-TCONF-001 selecting a single student for conference marks it selected', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  const { name, studentNames } = await createClassroomWithStudents(page, 1);
  expect(
    studentNames.length,
    'No students registered for this teacher account; seed at least 1 student to verify selection'
  ).toBeGreaterThanOrEqual(1);

  await classroomListPage.viewClassroom(name);
  await classroomDetailPage.editButton.waitFor();

  await expect(classroomDetailPage.studentCheckbox(studentNames[0])).not.toBeChecked();
  await classroomDetailPage.toggleStudent(studentNames[0]);
  await expect(classroomDetailPage.studentCheckbox(studentNames[0])).toBeChecked();
});

test('TC-TCONF-002 selecting multiple students for conference marks all selected', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  const { name, studentNames } = await createClassroomWithStudents(page, 2);
  expect(
    studentNames.length,
    'Fewer than 2 students registered for this teacher account; seed at least 2 students to verify multi-select'
  ).toBeGreaterThanOrEqual(2);

  await classroomListPage.viewClassroom(name);
  await classroomDetailPage.editButton.waitFor();

  for (const studentName of studentNames) {
    await classroomDetailPage.toggleStudent(studentName);
  }
  for (const studentName of studentNames) {
    await expect(classroomDetailPage.studentCheckbox(studentName)).toBeChecked();
  }
});

test('TC-TCONF-003 Start Conference button is disabled until a student is selected', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  const { name, studentNames } = await createClassroomWithStudents(page, 1);
  expect(
    studentNames.length,
    'No students registered for this teacher account; seed at least 1 student to verify button state'
  ).toBeGreaterThanOrEqual(1);

  await classroomListPage.viewClassroom(name);
  await classroomDetailPage.editButton.waitFor();

  await expect(classroomDetailPage.startConferenceButton).toBeDisabled();
  await classroomDetailPage.toggleStudent(studentNames[0]);
  await expect(classroomDetailPage.startConferenceButton).toBeEnabled();
});

test('TC-TCONF-START starting a conference against the real backend reaches the call screen', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  const { name, studentNames } = await createClassroomWithStudents(page, 1);
  expect(
    studentNames.length,
    'No students registered for this teacher account; seed at least 1 student to verify conference start'
  ).toBeGreaterThanOrEqual(1);

  await classroomListPage.viewClassroom(name);
  await classroomDetailPage.editButton.waitFor();

  await classroomDetailPage.toggleStudent(studentNames[0]);
  await classroomDetailPage.startConference();

  await expect(classroomDetailPage.callScreenHeading).toBeVisible({ timeout: 15000 });
  await expect(classroomDetailPage.endConferenceButton).toBeVisible();
  await classroomDetailPage.endConferenceButton.click();
});
