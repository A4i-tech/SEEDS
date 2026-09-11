// @ts-check
const { test, expect } = require('@playwright/test');
const { PERSONAS } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ContentPage } = require('../pages/ContentPage');
const { SchoolsPage } = require('../pages/SchoolsPage');

// IDEMPOTENCY NOTE: the Docmost doc's TC-SCHOOL-002..005 chain uses a fixed
// school email (testschool@gmail.com) shared across create/duplicate/update/delete
// steps. Automating that literally means: rerun the suite without 005 having run
// (an earlier assertion failure, a skipped test, CI cancelled mid-run) and 002
// permanently fails with "already exists" on every future run. Instead, this file
// generates a unique school email per run and runs 002-005 in one serial block
// against that single school, ending with delete — so a full pass always returns
// the account to a clean state regardless of how many times it's rerun.
test.describe.configure({ mode: 'serial' });

test('TC-SCHOOL-001 existing schools are listed for a tenant', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);
  const schoolsPage = new SchoolsPage(page);

  await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await contentPage.waitForLoad();
  await schoolsPage.open();

  await expect(page.getByText('school@test-a4i.local', { exact: true })).toBeVisible();
  await expect(page.getByText('a4itestschool@iiitb.ac.in', { exact: true })).toBeVisible();
});

test.describe('school CRUD (unique per run, self-cleaning)', () => {
  const uniqueEmail = `school-e2e-${Date.now()}@example.com`;
  const updatedName = `test-school-updated-${Date.now()}`;

  test('TC-SCHOOL-002 new school registration', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const schoolsPage = new SchoolsPage(page);

    await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await contentPage.waitForLoad();
    await schoolsPage.open();

    await schoolsPage.createSchool('test-school-e2e', uniqueEmail, 'Test@123');

    await expect(page.getByText('School created successfully!')).toBeVisible({ timeout: 10000 });
    await expect(schoolsPage.row(uniqueEmail)).toBeVisible();
  });

  test('TC-SCHOOL-003 school registration fails for a duplicate email', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const schoolsPage = new SchoolsPage(page);

    await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await contentPage.waitForLoad();
    await schoolsPage.open();

    await schoolsPage.createSchool('test-school-e2e-retry', uniqueEmail, 'Test@321');

    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 10000 });
    await expect(schoolsPage.row(uniqueEmail)).toHaveCount(1);
  });

  test('TC-SCHOOL-004 school update', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const schoolsPage = new SchoolsPage(page);

    await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await contentPage.waitForLoad();
    await schoolsPage.open();

    await schoolsPage.editSchool(uniqueEmail);
    await schoolsPage.saveEdit(updatedName);

    await expect(page.getByText('School updated successfully!')).toBeVisible({ timeout: 10000 });
    await expect(schoolsPage.row(uniqueEmail)).toContainText(updatedName);
  });

  test('TC-SCHOOL-005 school deletion', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);
    const schoolsPage = new SchoolsPage(page);

    await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await contentPage.waitForLoad();
    await schoolsPage.open();

    await schoolsPage.deleteSchool(uniqueEmail);

    await expect(page.getByText('School deleted successfully!')).toBeVisible({ timeout: 10000 });
    await expect(schoolsPage.row(uniqueEmail)).toHaveCount(0);
  });
});
