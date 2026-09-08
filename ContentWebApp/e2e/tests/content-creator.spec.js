// @ts-check
const { test, expect } = require('@playwright/test');
const { PERSONAS, uniquePhone } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ContentPage } = require('../pages/ContentPage');
const { TeachersPage } = require('../pages/TeachersPage');
const { loginInNewContext } = require('../fixtures/session');

// Same page/component as teacher.spec.js (content creators are registered and
// managed through the same "Register User" form and Teachers table, just with
// role=content_creator) — see teacher.spec.js for the idempotency rationale.
test.describe.configure({ mode: 'serial' });

test.describe('content creator CRUD (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();
  const updatedName = `test-content-creator-updated-${Date.now()}`;

  test('TC-CC-001 new content creator registration', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const teachersPage = new TeachersPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await teachersPage.open();

    await teachersPage.register({ name: 'test-content-creator-e2e', phone, password: 'Test@123', role: 'content_creator' });

    await expect(page.getByText('Content creator registered successfully!')).toBeVisible({ timeout: 10000 });
    await expect(teachersPage.row(phone)).toBeVisible();
  });

  test('TC-CC-002 content creator registration fails for a duplicate phone number', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const teachersPage = new TeachersPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await teachersPage.open();

    await teachersPage.register({ name: 'test-content-creator-e2e-retry', phone, password: 'Test@123', role: 'content_creator' });

    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 10000 });
    await expect(teachersPage.row(phone)).toHaveCount(1);
  });

  test('TC-CC-003 content creator update', async ({ page }) => {
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

  test('TC-CC-004 content creator deletion', async ({ page }) => {
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

test.describe('content creator transfer (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();

  test('TC-CC-005 content creator transfer between schools', async ({ page, browser }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const teachersPage = new TeachersPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await teachersPage.open();
    await teachersPage.register({ name: 'test-cc-transfer-e2e', phone, password: 'Test@123', role: 'content_creator' });
    await expect(page.getByText('Content creator registered successfully!')).toBeVisible({ timeout: 10000 });

    await teachersPage.transferTeacher(phone, 'A4I IIITB');
    await expect(page.getByText('Teacher transferred successfully.')).toBeVisible({ timeout: 10000 });
    await expect(teachersPage.row(phone)).toHaveCount(0);

    // Fresh context for A4I IIITB rather than logout+relogin — see
    // fixtures/session.js and teacher.spec.js's TC-TCHR-006 for why
    // (A4i-tech/.github#591).
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

    await a4iTeachersPage.deleteTeacher(phone);
    await expect(a4iPage.getByText('Teacher deleted successfully.')).toBeVisible({ timeout: 10000 });
    await a4iContext.close();
  });
});
