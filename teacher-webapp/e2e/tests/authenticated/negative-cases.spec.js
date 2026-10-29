// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueClassroomName } = require('../../fixtures/instances');
const { createClassroomWithStudents } = require('../../fixtures/classroomHelpers');
const { ClassroomListPage } = require('../../pages/ClassroomListPage');
const { ClassroomFormPage } = require('../../pages/ClassroomFormPage');
const { ClassroomDetailPage } = require('../../pages/ClassroomDetailPage');
const { ContentDrawerPage } = require('../../pages/ContentDrawerPage');

test('TC-TNEG-001 classroom dashboard shows an error when the list fails to load', async ({ page }) => {
  await page.route('**/class', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 500, body: 'error' }) : route.continue()
  );

  const classroomListPage = new ClassroomListPage(page);
  await page.goto('/classrooms');

  await expect(page.getByText(/failed to load classrooms/i)).toBeVisible({ timeout: 10000 });
});

test('TC-TNEG-002 create classroom shows an error when the save request fails', async ({ page }) => {
  await page.route('**/class', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, body: JSON.stringify({ message: 'save failed' }) }) : route.continue()
  );

  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(uniqueClassroomName());
  await classroomFormPage.submit();

  await expect(page.getByText(/failed to save classroom/i)).toBeVisible({ timeout: 10000 });
  await expect(classroomFormPage.nameInput).toBeVisible();
});

test('TC-TNEG-003 starting a conference shows an error when the create request fails', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  const { name: classroomName, studentNames } = await createClassroomWithStudents(page, 1);
  expect(
    studentNames.length,
    'No students registered for this teacher account; seed at least 1 student to verify conference create failure'
  ).toBeGreaterThanOrEqual(1);

  await page.route('**/conference/create', (route) => route.fulfill({ status: 500, body: 'error' }));

  await classroomListPage.goto();
  await classroomListPage.viewClassroom(classroomName);
  await classroomDetailPage.editButton.waitFor();
  await classroomDetailPage.toggleStudent(studentNames[0]);
  await classroomDetailPage.startConference();

  await expect(page.getByText(/failed to create conference/i)).toBeVisible({ timeout: 10000 });
  await expect(classroomDetailPage.startConferenceButton).toBeVisible();
});

test('TC-TNEG-004 selecting content shows an error when the audio URL fetch fails', async ({ page }) => {
  await page.route('**/content/sasUrl*', (route) => route.fulfill({ status: 500, body: 'error' }));

  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);
  await classroomListPage.goto();
  const contentResponse = page.waitForResponse(
    (res) => /\/content(\?|$)/.test(res.url()) && res.request().method() === 'GET'
  );
  await classroomListPage.playContentButton.click();
  await contentDrawerPage.searchInput.waitFor();
  const body = await (await contentResponse).json();
  test.skip(!body.data || body.data.length === 0, 'No content available in the library for this tenant');
  await expect(contentDrawerPage.firstContentItem()).toBeVisible({ timeout: 10000 });

  const title = (await contentDrawerPage.firstContentItem().innerText()).trim();
  await contentDrawerPage.playContent(title);

  await expect(page.getByText(/failed to load audio/i)).toBeVisible({ timeout: 10000 });
});

test('TC-TNEG-005 a student already assigned to a classroom cannot be re-added as a duplicate', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);
  const addedLabel = await classroomFormPage.addFirstAvailableStudent();
  test.skip(!addedLabel, 'No students registered for this teacher account to verify duplicate prevention');
  const studentName = addedLabel.split(' - ')[0];
  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();

  await classroomListPage.editClassroom(name);
  await classroomFormPage.nameInput.waitFor();
  await classroomFormPage.studentSearchInput.fill(studentName);
  await page.getByRole('listbox').waitFor({ timeout: 5000 });
  await expect(page.getByRole('option', { name: addedLabel })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await expect(classroomFormPage.nameInput).toBeVisible();
  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();
});

test('TC-TNEG-006 content library pagination does not issue an extra fetch past the last page', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  const listRequests = [];
  page.on('request', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname.endsWith('/content')) listRequests.push(req.url());
  });

  await classroomListPage.goto();
  const contentResponse = page.waitForResponse(
    (res) => /\/content(\?|$)/.test(res.url()) && res.request().method() === 'GET'
  );
  await classroomListPage.playContentButton.click();
  await contentDrawerPage.searchInput.waitFor();
  const body = await (await contentResponse).json();
  test.skip(!body.data || body.data.length === 0, 'No content available in the library for this tenant');
  await expect(contentDrawerPage.firstContentItem()).toBeVisible({ timeout: 10000 });

  let clicks = 0;
  while ((await contentDrawerPage.loadMoreButton.isVisible().catch(() => false)) && clicks < 20) {
    const listResponse = page.waitForResponse(
      (res) => res.url().includes('/content') && res.request().method() === 'GET'
    );
    await contentDrawerPage.loadMoreButton.click();
    await listResponse;
    clicks += 1;
  }
  test.skip(clicks === 0, 'Content Library has only a single page for this tenant; no pagination to verify');

  await expect(contentDrawerPage.loadMoreButton).toBeHidden();
  const countAtLastPage = listRequests.length;
  await expect.poll(() => listRequests.length, { timeout: 2000 }).toBe(countAtLastPage);
});
