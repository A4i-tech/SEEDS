// @ts-check
const { expect } = require('@playwright/test');
const { uniqueClassroomName } = require('./instances');
const { ClassroomListPage } = require('../pages/ClassroomListPage');
const { ClassroomFormPage } = require('../pages/ClassroomFormPage');

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

  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();
  classroomsToCleanup.push(name);
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

// Opens the Content Library and skips the test if no content is available for
// the authenticated tenant (content-dependent cases cannot be exercised
// deterministically without seeded audio content).
async function openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage) {
  await classroomListPage.goto();
  const contentResponse = page.waitForResponse(
    (res) => /\/content(\?|$)/.test(res.url()) && res.request().method() === 'GET'
  );
  await classroomListPage.playContentButton.click();
  await contentDrawerPage.searchInput.waitFor();
  const body = await (await contentResponse).json();
  test.skip(body.data.length === 0, 'No content available in the library for this tenant');
  await expect(contentDrawerPage.firstContentItem()).toBeVisible({ timeout: 10000 });
}

module.exports = {
  createClassroomWithStudents,
  cleanupClassrooms,
  registerClassroomForCleanup,
  openLibraryOrSkip,
};
