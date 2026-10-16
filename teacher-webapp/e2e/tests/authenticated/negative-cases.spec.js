// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueClassroomName } = require('../../fixtures/instances');
const { ClassroomListPage } = require('../../pages/ClassroomListPage');
const { ClassroomFormPage } = require('../../pages/ClassroomFormPage');
const { ClassroomDetailPage } = require('../../pages/ClassroomDetailPage');
const { ContentDrawerPage } = require('../../pages/ContentDrawerPage');

async function findClassroomWithStudents(page) {
  const classroomListPage = new ClassroomListPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  await classroomListPage.goto();
  const count = await classroomListPage.page.locator('.MuiCard-root').count();
  for (let i = 0; i < count; i += 1) {
    const card = classroomListPage.page.locator('.MuiCard-root').nth(i);
    const name = (await card.locator('h6').innerText()).trim();
    await classroomListPage.viewClassroom(name);
    await classroomDetailPage.editButton.waitFor();
    if ((await classroomDetailPage.page.locator('.MuiListItem-root').count()) > 0) {
      return name;
    }
    await classroomListPage.goto();
  }
  return null;
}

// TC-TNEG-001: Verify a failed classrooms list fetch shows an error instead of a blank dashboard
test('TC-TNEG-001 classroom dashboard shows an error when the list fails to load', async ({ page }) => {
  await page.route('**/class', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 500, body: 'error' }) : route.continue()
  );

  const classroomListPage = new ClassroomListPage(page);
  await page.goto('/classrooms');

  await expect(page.getByText(/failed to load classrooms/i)).toBeVisible({ timeout: 10000 });
});

// TC-TNEG-002: Verify a failed classroom create shows an error and keeps the form open
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

// TC-TNEG-003: Verify a failed conference create surfaces an error on the classroom detail page
test('TC-TNEG-003 starting a conference shows an error when the create request fails', async ({ page }) => {
  const classroomName = await findClassroomWithStudents(page);
  test.skip(!classroomName, 'No classroom with at least one student is available on this instance');

  await page.route('**/conference/create', (route) => route.fulfill({ status: 500, body: 'error' }));

  const classroomListPage = new ClassroomListPage(page);
  const classroomDetailPage = new ClassroomDetailPage(page);
  await classroomListPage.goto();
  await classroomListPage.viewClassroom(classroomName);
  await classroomDetailPage.editButton.waitFor();
  await classroomDetailPage.toggleStudent(await classroomDetailPage.page.locator('.MuiListItem-root').first().innerText());
  await classroomDetailPage.startConference();

  await expect(page.getByText(/failed to create conference/i)).toBeVisible({ timeout: 10000 });
  await expect(classroomDetailPage.startConferenceButton).toBeVisible();
});

// TC-TNEG-004: Verify a failed content SAS URL fetch shows an error instead of silently not playing
test('TC-TNEG-004 selecting content shows an error when the audio URL fetch fails', async ({ page }) => {
  await page.route('**/content/sasUrl*', (route) => route.fulfill({ status: 500, body: 'error' }));

  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);
  await classroomListPage.goto();
  await classroomListPage.playContentButton.click();
  await contentDrawerPage.searchInput.waitFor();

  const firstTitle = page.locator('[role="presentation"] .MuiTypography-body2').first();
  test.skip(!(await firstTitle.isVisible().catch(() => false)), 'No content available in the library');
  const title = (await firstTitle.innerText()).trim();
  await contentDrawerPage.playContent(title);

  await expect(page.getByText(/failed to load audio/i)).toBeVisible({ timeout: 10000 });
});

// TC-TNEG-005: Verify saving a classroom with a duplicate student surfaces a validation error
test('TC-TNEG-005 saving a classroom with a duplicate student shows a validation error', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);
  const addedLabel = await classroomFormPage.addFirstAvailableStudent();
  test.skip(!addedLabel, 'No students registered for this teacher account to verify duplicate validation');

  await page.route('**/class', (route) =>
    route.fulfill({ status: 400, body: JSON.stringify({ message: 'Duplicate students are not allowed' }) }),
  );
  await classroomFormPage.submit();

  await expect(page.getByText(/duplicate students are not allowed/i)).toBeVisible({ timeout: 10000 });
  await expect(classroomFormPage.nameInput).toBeVisible();
});

// TC-TNEG-006: Verify Content Library pagination stops fetching once the last page is reached
test('TC-TNEG-006 content library pagination does not issue an extra fetch past the last page', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  const listRequests = [];
  page.on('request', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname.endsWith('/content')) listRequests.push(req.url());
  });

  await classroomListPage.goto();
  await classroomListPage.playContentButton.click();
  await contentDrawerPage.searchInput.waitFor();
  const hasContent = await contentDrawerPage.firstContentItem().isVisible().catch(() => false);
  test.skip(!hasContent, 'No content available in the library for this tenant');

  let clicks = 0;
  while ((await contentDrawerPage.loadMoreButton.isVisible().catch(() => false)) && clicks < 20) {
    await contentDrawerPage.loadMoreButton.click();
    await page.waitForTimeout(300);
    clicks += 1;
  }
  test.skip(clicks === 0, 'Content Library has only a single page for this tenant; no pagination to verify');

  const countAtLastPage = listRequests.length;
  await page.waitForTimeout(1000);
  expect(listRequests.length).toBe(countAtLastPage);
  await expect(contentDrawerPage.loadMoreButton).toBeHidden();
});
