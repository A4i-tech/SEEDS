// @ts-check
const { test, expect } = require('@playwright/test');
const { PERSONAS, uniquePhone } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ContentPage } = require('../pages/ContentPage');
const { TeachersPage } = require('../pages/TeachersPage');
const { loginInNewContext } = require('../fixtures/session');

// IDEMPOTENCY NOTE: same pattern as school.spec.js. Two independent generated
// phone numbers are used so the CRUD chain (register/duplicate/update/delete) and
// the transfer chain can each run as a self-contained, self-cleaning
// test.describe.configure({ mode: 'serial' }) block. TC-TCHR-006 (transfer)
// permanently moves the teacher to another school with no undo in the product —
// so its block ends by deleting the transferred teacher from the destination
// school, otherwise every rerun leaves one more orphaned teacher under A4I IIITB.
test.describe.configure({ mode: 'serial' });

test('TC-TCHR-001 existing teachers and content creators are listed for a school', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);
  const teachersPage = new TeachersPage(page);

  await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
  await contentPage.waitForLoad();
  await teachersPage.open();

  await expect(page.getByText('9717503152', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('8904954840', { exact: true }).first()).toBeVisible();
});

test.describe('teacher CRUD (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();
  const updatedName = `test-teacher-updated-${Date.now()}`;

  test('TC-TCHR-002 new teacher registration', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const teachersPage = new TeachersPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await teachersPage.open();

    await teachersPage.register({ name: 'test-teacher-e2e', phone, password: 'Test@123' });

    await expect(page.getByText('Teacher registered successfully!')).toBeVisible({ timeout: 10000 });
    await expect(teachersPage.row(phone)).toBeVisible();
  });

  test('TC-TCHR-003 teacher registration fails for a duplicate phone number', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const teachersPage = new TeachersPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await teachersPage.open();

    await teachersPage.register({ name: 'test-teacher-e2e-retry', phone, password: 'Test@123' });

    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 10000 });
    await expect(teachersPage.row(phone)).toHaveCount(1);
  });

  test('TC-TCHR-004 teacher update', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const teachersPage = new TeachersPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await teachersPage.open();

    await teachersPage.editTeacher(phone);
    await teachersPage.saveEdit(updatedName);

    await expect(page.getByText('Teacher updated successfully.')).toBeVisible({ timeout: 10000 });
    await expect(teachersPage.row(phone)).toContainText(updatedName);
  });

  test('TC-TCHR-005 teacher deletion', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const teachersPage = new TeachersPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await teachersPage.open();

    await teachersPage.deleteTeacher(phone);

    await expect(page.getByText('Teacher deleted successfully.')).toBeVisible({ timeout: 10000 });
    await expect(teachersPage.row(phone)).toHaveCount(0);
  });
});

test.describe('teacher transfer (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();

  test('TC-TCHR-006 teacher transfer between schools', async ({ page, browser }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const teachersPage = new TeachersPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await teachersPage.open();
    await teachersPage.register({ name: 'test-teacher-transfer-e2e', phone, password: 'Test@123' });
    await expect(page.getByText('Teacher registered successfully!')).toBeVisible({ timeout: 10000 });

    await teachersPage.transferTeacher(phone, 'A4I IIITB');
    await expect(page.getByText('Teacher transferred successfully.')).toBeVisible({ timeout: 10000 });
    await expect(teachersPage.row(phone)).toHaveCount(0);

    // A fresh context for A4I IIITB rather than logout+relogin on the same
    // page — see fixtures/session.js's comment (logout right after a
    // mutating action like this transfer was found to silently
    // re-authenticate before the login form ever rendered, matching
    // A4i-tech/.github#591).
    const { context: a4iContext, page: a4iPage } = await loginInNewContext(
      browser,
      PERSONAS.schoolA4I.identifier,
      PERSONAS.schoolA4I.password
    );
    const a4iContentPage = new ContentPage(a4iPage);
    const a4iTeachersPage = new TeachersPage(a4iPage);
    await a4iContentPage.waitForLoad();
    await a4iTeachersPage.open();
    await expect(a4iTeachersPage.row(phone)).toBeVisible();

    // Cleanup: the product has no "transfer back" affordance, so delete the
    // teacher from the destination school to keep this run self-cleaning.
    await a4iTeachersPage.deleteTeacher(phone);
    await expect(a4iPage.getByText('Teacher deleted successfully.')).toBeVisible({ timeout: 10000 });
    await a4iContext.close();
  });
});
