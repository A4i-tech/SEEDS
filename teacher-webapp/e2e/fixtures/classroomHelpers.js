// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueClassroomName } = require('./instances');
const { ClassroomListPage } = require('../pages/ClassroomListPage');
const { ClassroomFormPage } = require('../pages/ClassroomFormPage');
const { ContentDrawerPage } = require('../pages/ContentDrawerPage');

let classroomsToCleanup = [];

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
  if (studentNames.length === 0) {
    throw new Error('No students registered for the E2E teacher account; seed at least one student fixture to run this test');
  }

  registerClassroomForCleanup(name);
  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();
  return { name, studentNames };
}

async function cleanupClassrooms(page) {
  const classroomListPage = new ClassroomListPage(page);
  const namesToDelete = classroomsToCleanup;
  classroomsToCleanup = [];
  for (const name of namesToDelete) {
    await classroomListPage.goto();
    if (await classroomListPage.classroomCard(name).count()) {
      await classroomListPage.deleteClassroom(name);
    }
  }
}

function registerClassroomForCleanup(name) {
  classroomsToCleanup.push(name);
}

async function openLibraryOrSkip(page) {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);
  await classroomListPage.goto();
  const [response] = await Promise.all([
    page.waitForResponse((res) => /\/content(\?|$)/.test(res.url()) && res.request().method() === 'GET'),
    classroomListPage.playContentButton.click(),
  ]);
  await contentDrawerPage.searchInput.waitFor();
  const body = await response.json();
  test.skip(body.data.length === 0, 'No content available in the library for this tenant');
  await expect(contentDrawerPage.firstContentItem()).toBeVisible({ timeout: 10000 });
}

module.exports = {
  createClassroomWithStudents,
  cleanupClassrooms,
  registerClassroomForCleanup,
  openLibraryOrSkip,
};
