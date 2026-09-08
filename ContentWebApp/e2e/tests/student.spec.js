// @ts-check
const { test, expect } = require('@playwright/test');
const { PERSONAS, uniquePhone } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ContentPage } = require('../pages/ContentPage');
const { StudentsPage } = require('../pages/StudentsPage');

// IDEMPOTENCY NOTE: same pattern as school/teacher specs. Two generated phone
// numbers (studentA for the main CRUD chain, studentB purely to give TC-STU-006 an
// existing number to collide with) keep this file self-contained and self-cleaning.
//
// UI GAP (confirmed live): StudentsSection.js never renders the flash message
// useTeachers.js produces for add/update/delete student actions — unlike
// SchoolsPanel/TeacherRegistrationForm, which both show success/error text.
// Confirmed via network log that the underlying requests still succeed/fail
// correctly (POST 201, duplicate POST 409, etc.) with zero visible feedback. So
// every assertion below checks the actual HTTP status (via StudentsPage's
// response-capturing methods) and the resulting row state, not any message text.
test.describe.configure({ mode: 'serial' });

test('TC-STU-001 existing students are listed for a school', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);
  const studentsPage = new StudentsPage(page);

  await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
  await contentPage.waitForLoad();
  await studentsPage.open();

  await expect(page.getByText('7567071072', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('9012345700', { exact: true }).first()).toBeVisible();
});

test.describe('student CRUD (unique per run, self-cleaning)', () => {
  const phoneA = uniquePhone();
  const phoneB = uniquePhone();
  const phoneANew = uniquePhone();
  const updatedName = `test-student-updated-${Date.now()}`;

  test('TC-STU-002 new student registration', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const studentsPage = new StudentsPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await studentsPage.open();

    const status = await studentsPage.addStudent('test-student-e2e', phoneA);

    expect(status).toBe(201);
    await expect(studentsPage.row(phoneA)).toBeVisible();
  });

  test('TC-STU-003 student re-registration fails for a duplicate phone number', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const studentsPage = new StudentsPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await studentsPage.open();

    const status = await studentsPage.addStudent('test-student-e2e-retry', phoneA);

    expect(status).toBeGreaterThanOrEqual(400);
    await expect(studentsPage.row(phoneA)).toHaveCount(1);
  });

  test('TC-STU-004 student name update', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const studentsPage = new StudentsPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await studentsPage.open();

    await studentsPage.editStudent(phoneA);
    const status = await studentsPage.saveEditName(updatedName);

    expect(status).toBe(200);
    await expect(studentsPage.row(phoneA)).toContainText(updatedName);
  });

  test('TC-STU-005 student phone number update to a new, unused number', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const studentsPage = new StudentsPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await studentsPage.open();

    await studentsPage.editStudent(phoneA);
    const status = await studentsPage.saveEditPhone(phoneANew);

    expect(status).toBe(200);
    await expect(studentsPage.row(phoneANew)).toBeVisible();
  });

  test('TC-STU-006 student phone number update fails for an existing number', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const studentsPage = new StudentsPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await studentsPage.open();

    // Give phoneA (now at phoneANew) an existing number to collide with.
    const addStatus = await studentsPage.addStudent('test-student-e2e-b', phoneB);
    expect(addStatus).toBe(201);

    await studentsPage.editStudent(phoneANew);
    const status = await studentsPage.saveEditPhone(phoneB);

    expect(status).toBeGreaterThanOrEqual(400);
    await expect(studentsPage.row(phoneANew)).toBeVisible();
  });

  test('TC-STU-007 student deletion', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const studentsPage = new StudentsPage(page);

    await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await studentsPage.open();

    const status = await studentsPage.deleteStudent(phoneANew);
    expect(status).toBe(200);
    await expect(studentsPage.row(phoneANew)).toHaveCount(0);

    // Cleanup: delete studentB too (created only to give TC-STU-006 a collision
    // target), so this run doesn't leave it behind.
    const cleanupStatus = await studentsPage.deleteStudent(phoneB);
    expect(cleanupStatus).toBe(200);
    await expect(studentsPage.row(phoneB)).toHaveCount(0);
  });
});
