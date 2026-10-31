// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueClassroomName } = require('../../fixtures/instances');
const { createClassroomWithStudents } = require('../../fixtures/classroomHelpers');
const { ClassroomListPage } = require('../../pages/ClassroomListPage');
const { ClassroomFormPage } = require('../../pages/ClassroomFormPage');
const { ClassroomDetailPage } = require('../../pages/ClassroomDetailPage');

test.describe.configure({ mode: 'serial' });

let classroomsToCleanup = [];

test.afterEach(async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const namesToDelete = classroomsToCleanup;
  classroomsToCleanup = [];
  for (const name of namesToDelete) {
    await classroomListPage.goto();
    if (await classroomListPage.classroomCard(name).count()) {
      await classroomListPage.deleteClassroom(name);
    }
  }
});

test('TC-TCLS-001 My Classrooms list loads and shows the classroom list', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  await classroomListPage.goto();
  await expect(classroomListPage.heading).toBeVisible();
});

test('TC-TCLS-002 create classroom with a valid name persists with correct student count', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);
  await classroomFormPage.submit();
  classroomsToCleanup.push(name);

  await classroomListPage.heading.waitFor();
  const card = classroomListPage.classroomCard(name);
  await expect(card).toBeVisible();
  await expect(card.getByText('0 Students')).toBeVisible();
});

test('TC-TCLS-003 create classroom fails without a name', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.nameInput.waitFor();
  await classroomFormPage.fillName('   ');
  await classroomFormPage.submit();

  await expect(page.getByText('Class name is required')).toBeVisible({ timeout: 10000 });
  await expect(classroomFormPage.nameInput).toBeVisible();
});

test('TC-TCLS-004 create classroom without any students is rejected', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);
  await classroomFormPage.submit();

  await expect(page.getByText('Request failed with status code 422')).toBeVisible({ timeout: 10000 });
  await expect(classroomFormPage.nameInput).toBeVisible();
});

test('TC-TCLS-005 classroom detail view shows the student list for conference selection', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  const { name, studentNames } = await createClassroomWithStudents(page, 1);
  if (!studentNames.length) {
    throw new Error('No students registered for the E2E teacher account; seed at least one student fixture to run TC-TCLS-005');
  }
  classroomsToCleanup.push(name);

  await classroomListPage.editClassroom(name);
  await classroomFormPage.nameInput.waitFor();
  await classroomFormPage.removeStudent(studentNames[0]);
  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();

  await classroomListPage.viewClassroom(name);
  await classroomDetailPage.editButton.waitFor();
  await expect(classroomDetailPage.startConferenceButton).toBeDisabled();
  await expect(page.getByText('No students in this classroom')).toBeVisible();

  await classroomListPage.goto();
  await classroomListPage.editClassroom(name);
  await classroomFormPage.nameInput.waitFor();
  const addedLabel = await classroomFormPage.addFirstAvailableStudent();
  if (!addedLabel) {
    throw new Error('No students registered for the E2E teacher account; seed at least one student fixture to run TC-TCLS-005');
  }
  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();

  const studentName = addedLabel.split(' - ')[0];
  await classroomListPage.viewClassroom(name);
  await classroomDetailPage.editButton.waitFor();

  await expect(classroomDetailPage.studentListItem(studentName)).toBeVisible();
  await expect(classroomDetailPage.studentCheckbox(studentName)).not.toBeChecked();

  await classroomDetailPage.toggleStudent(studentName);

  await expect(classroomDetailPage.studentCheckbox(studentName)).toBeChecked();
  await expect(classroomDetailPage.startConferenceButton).toBeEnabled();
});

test('TC-TCLS-006 edit classroom name updates it in the dashboard', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const originalName = uniqueClassroomName();
  const renamedName = `${originalName} Renamed`;

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(originalName);
  await classroomFormPage.submit();
  classroomsToCleanup.push(originalName);
  await classroomListPage.heading.waitFor();

  await classroomListPage.editClassroom(originalName);
  await classroomFormPage.nameInput.waitFor();
  await classroomFormPage.fillName(renamedName);
  await classroomFormPage.submit();

  await classroomListPage.heading.waitFor();
  classroomsToCleanup = classroomsToCleanup.filter((n) => n !== originalName);
  classroomsToCleanup.push(renamedName);
  await expect(classroomListPage.classroomCard(renamedName)).toBeVisible();
  await expect(classroomListPage.classroomCard(originalName)).toHaveCount(0);
});

test('TC-TCLS-007 add student to existing classroom updates the student count', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);
  await classroomFormPage.submit();
  classroomsToCleanup.push(name);
  await classroomListPage.heading.waitFor();

  await classroomListPage.editClassroom(name);
  await classroomFormPage.nameInput.waitFor();

  const addedLabel = await classroomFormPage.addFirstAvailableStudent();
  if (!addedLabel) {
    throw new Error('No students registered for the E2E teacher account; seed at least one student fixture to run TC-TCLS-007');
  }

  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();

  await expect(classroomListPage.classroomCard(name).getByText('1 Students')).toBeVisible();
});

test('TC-TCLS-008 remove student from classroom via edit updates the student count', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);
  await classroomFormPage.submit();
  classroomsToCleanup.push(name);
  await classroomListPage.heading.waitFor();

  await classroomListPage.editClassroom(name);
  await classroomFormPage.nameInput.waitFor();
  const addedLabel = await classroomFormPage.addFirstAvailableStudent();
  if (!addedLabel) {
    throw new Error('No students registered for the E2E teacher account; seed at least one student fixture to run TC-TCLS-008');
  }
  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();
  await expect(classroomListPage.classroomCard(name).getByText('1 Students')).toBeVisible();

  await classroomListPage.editClassroom(name);
  await classroomFormPage.nameInput.waitFor();
  const studentName = addedLabel.split(' - ')[0];
  await classroomFormPage.removeStudent(studentName);
  await classroomFormPage.submit();

  await classroomListPage.heading.waitFor();
  await expect(classroomListPage.classroomCard(name).getByText('0 Students')).toBeVisible();
});

test('TC-TCLS-009 edit changes can be cancelled without persisting', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const originalName = uniqueClassroomName();
  const attemptedName = `${originalName} Unsaved`;

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(originalName);
  await classroomFormPage.submit();
  classroomsToCleanup.push(originalName);
  await classroomListPage.heading.waitFor();

  await classroomListPage.editClassroom(originalName);
  await classroomFormPage.nameInput.waitFor();
  await classroomFormPage.fillName(attemptedName);
  await classroomFormPage.cancelButton.click();

  await classroomListPage.heading.waitFor();
  await expect(classroomListPage.classroomCard(originalName)).toBeVisible();
  await expect(classroomListPage.classroomCard(attemptedName)).toHaveCount(0);
});

test('TC-TCLS-010 delete classroom confirmation dialog names the classroom', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);
  await classroomFormPage.submit();
  classroomsToCleanup.push(name);
  await classroomListPage.heading.waitFor();

  await classroomListPage.classroomCard(name).getByRole('button', { name: 'Delete' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Delete Classroom')).toBeVisible();
  await expect(dialog.getByText(`Are you sure you want to delete "${name}"`)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible();

  // Leave the dialog open state clean for subsequent tests by cancelling.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('TC-TCLS-011 cancel classroom deletion leaves the classroom in the list', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);
  await classroomFormPage.submit();
  classroomsToCleanup.push(name);
  await classroomListPage.heading.waitFor();

  await classroomListPage.classroomCard(name).getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog).toBeHidden();
  await expect(classroomListPage.classroomCard(name)).toBeVisible();
});

test('TC-TCLS-012 confirming delete removes the classroom from the dashboard', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);
  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();

  await classroomListPage.deleteClassroom(name);

  await expect(classroomListPage.classroomCard(name)).toHaveCount(0);
});
