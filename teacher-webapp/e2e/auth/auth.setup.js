// @ts-check
const { test: setup } = require('@playwright/test');
const { PERSONAS, authFile } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ClassroomListPage } = require('../pages/ClassroomListPage');

setup('authenticate as teacher', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const classroomListPage = new ClassroomListPage(page);
  const { identifier, password } = PERSONAS.teacher;

  await loginPage.login(identifier, password);
  await classroomListPage.heading.waitFor();

  await page.context().storageState({ path: authFile('teacher') });
});
