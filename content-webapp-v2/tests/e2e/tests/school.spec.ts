import { expect, test, type Locator, type Page } from '@playwright/test';
import { PERSONAS } from '../fixtures/instances';
import { bestEffortCleanup } from '../fixtures/session';
import { expectRowAbsentOnAllPages, expectRowOnAnyPage, gotoRowPage, login } from '../helpers';

async function openSchools(page: Page): Promise<void> {
  const schoolsFetched = page.waitForResponse(
    (res) => res.url().endsWith('/school') && res.request().method() === 'GET',
    { timeout: 10000 },
  );
  await page.getByRole('link', { name: 'Registration' }).click();
  await page.getByRole('button', { name: 'Create school' }).waitFor();
  await schoolsFetched;
}

function schoolsDialog(page: Page): Locator {
  return page.getByRole('dialog');
}

function schoolsRow(page: Page, email: string): Locator {
  return page.locator('tr', { has: page.getByText(email, { exact: true }) });
}

async function createSchool(page: Page, name: string, email: string, password: string): Promise<void> {
  await page.getByRole('button', { name: 'Create school' }).click();
  const dialog = schoolsDialog(page);
  await dialog.getByLabel('Name *', { exact: true }).fill(name);
  await dialog.getByLabel('Email *', { exact: true }).fill(email);
  await dialog.locator('input[type="password"]').fill(password);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
}

async function editSchool(page: Page, email: string): Promise<void> {
  await gotoRowPage(page, schoolsRow(page, email));
  await schoolsRow(page, email).getByRole('button', { name: 'Edit', exact: true }).click();
  await schoolsDialog(page).getByLabel('Name *', { exact: true }).waitFor();
}

async function saveEdit(page: Page, name: string): Promise<void> {
  const dialog = schoolsDialog(page);
  await dialog.getByLabel('Name *', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
}

async function deleteSchool(page: Page, email: string): Promise<void> {
  await gotoRowPage(page, schoolsRow(page, email));
  await schoolsRow(page, email).getByRole('button', { name: 'Delete', exact: true }).click();
  await schoolsDialog(page).getByRole('button', { name: 'Delete', exact: true }).click();
}

test.describe.configure({ mode: 'serial' });

test('TC-SCHOOL-001 existing schools are listed for a tenant', async ({ page }) => {
  await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await openSchools(page);

  await expectRowOnAnyPage(page, schoolsRow(page, 'school@test-a4i.local'));
  await expectRowOnAnyPage(page, schoolsRow(page, 'a4itestschool@iiitb.ac.in'));
});

test.describe('school CRUD (unique per run, self-cleaning)', () => {
  const uniqueEmail = `school-e2e-${Date.now()}@example.com`;
  const updatedName = `test-school-updated-${Date.now()}`;

  test('TC-SCHOOL-002 new school registration', async ({ page }) => {
    await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await openSchools(page);
    await createSchool(page, 'test-school-e2e', uniqueEmail, 'Test@123');

    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10000 });
    await expectRowOnAnyPage(page, schoolsRow(page, uniqueEmail));
  });

  test('TC-SCHOOL-003 school registration fails for a duplicate email', async ({ page }) => {
    await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await openSchools(page);
    await createSchool(page, 'test-school-e2e-retry', uniqueEmail, 'Test@321');

    await expect(schoolsDialog(page).getByText(/already exists/i)).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await expect(schoolsDialog(page)).toBeHidden({ timeout: 5000 });
    await gotoRowPage(page, schoolsRow(page, uniqueEmail));
    await expect(schoolsRow(page, uniqueEmail)).toHaveCount(1);
  });

  test('TC-SCHOOL-004 school update', async ({ page }) => {
    await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await openSchools(page);
    await editSchool(page, uniqueEmail);
    await saveEdit(page, updatedName);

    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10000 });
    await gotoRowPage(page, schoolsRow(page, uniqueEmail));
    await expect(schoolsRow(page, uniqueEmail)).toContainText(updatedName);
  });

  test('TC-SCHOOL-005 school deletion', async ({ page }) => {
    await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await openSchools(page);
    await deleteSchool(page, uniqueEmail);

    await expectRowAbsentOnAllPages(page, schoolsRow(page, uniqueEmail));
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.tenant, async (page) => {
      await openSchools(page);
      if (await gotoRowPage(page, schoolsRow(page, uniqueEmail))) {
        await deleteSchool(page, uniqueEmail);
      }
    });
  });
});
