import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { PERSONAS } from '../fixtures/instances';
import { expectRowAbsentOnAllPages, expectRowOnAnyPage, gotoRowPage } from '../pages/pagination';
import { SchoolsPage } from '../pages/SchoolsPage';

async function loginAs(page: Page, identifier: string, password: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Phone number or email').fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
  return new URL(page.url()).origin;
}

async function loginInNewContext(
  browser: Browser,
  origin: string,
  identifier: string,
  password: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await loginAs(page, identifier, password);
  return { context, page };
}

async function bestEffortCleanup(
  browser: Browser,
  origin: string,
  persona: { identifier: string; password: string },
  fn: (page: Page) => Promise<void>,
): Promise<void> {
  const { context, page } = await loginInNewContext(browser, origin, persona.identifier, persona.password);
  try {
    await fn(page);
  } catch (err) {
    console.warn(`bestEffortCleanup failed for ${persona.identifier}:`, err instanceof Error ? (err.stack ?? err.message) : String(err));
  } finally {
    await context.close();
  }
}

// Self-contained + self-cleaning: unique school email per run, deleted at the end.
test.describe.configure({ mode: 'serial' });

let origin = '';

test('TC-SCHOOL-001 existing schools are listed for a tenant', async ({ page }) => {
  const schoolsPage = new SchoolsPage(page);

  origin = await loginAs(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await schoolsPage.open();

  await expectRowOnAnyPage(page, schoolsPage.row('school@test-a4i.local'));
  await expectRowOnAnyPage(page, schoolsPage.row('a4itestschool@iiitb.ac.in'));
});

test.describe('school CRUD (unique per run, self-cleaning)', () => {
  const uniqueEmail = `school-e2e-${Date.now()}@example.com`;
  const updatedName = `test-school-updated-${Date.now()}`;

  test('TC-SCHOOL-002 new school registration', async ({ page }) => {
    const schoolsPage = new SchoolsPage(page);

    origin = await loginAs(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await schoolsPage.open();
    await schoolsPage.createSchool('test-school-e2e', uniqueEmail, 'Test@123');

    // v2 shows a generic 'Saved.' notification (no per-action flash text).
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10000 });
    await expectRowOnAnyPage(page, schoolsPage.row(uniqueEmail));
  });

  test('TC-SCHOOL-003 school registration fails for a duplicate email', async ({ page }) => {
    const schoolsPage = new SchoolsPage(page);

    origin = await loginAs(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await schoolsPage.open();
    await schoolsPage.createSchool('test-school-e2e-retry', uniqueEmail, 'Test@321');

    // v2 surfaces the 409 as an Alert inside the still-open dialog.
    await expect(schoolsPage.dialog().getByText(/already exists/i)).toBeVisible({ timeout: 10000 });
    // Close the dialog before paging: the modal overlay intercepts pager clicks.
    await page.keyboard.press('Escape');
    await expect(schoolsPage.dialog()).toBeHidden({ timeout: 5000 });
    await gotoRowPage(page, schoolsPage.row(uniqueEmail));
    await expect(schoolsPage.row(uniqueEmail)).toHaveCount(1);
  });

  test('TC-SCHOOL-004 school update', async ({ page }) => {
    const schoolsPage = new SchoolsPage(page);

    origin = await loginAs(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await schoolsPage.open();
    await schoolsPage.editSchool(uniqueEmail);
    await schoolsPage.saveEdit(updatedName);

    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10000 });
    await gotoRowPage(page, schoolsPage.row(uniqueEmail));
    await expect(schoolsPage.row(uniqueEmail)).toContainText(updatedName);
  });

  test('TC-SCHOOL-005 school deletion', async ({ page }) => {
    const schoolsPage = new SchoolsPage(page);

    origin = await loginAs(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await schoolsPage.open();
    // Delete-confirm coverage: v2 uses a Mantine confirm modal, no toast.
    await schoolsPage.deleteSchool(uniqueEmail);

    await expectRowAbsentOnAllPages(page, schoolsPage.row(uniqueEmail));
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, origin, PERSONAS.tenant, async (page) => {
      const schoolsPage = new SchoolsPage(page);
      await schoolsPage.open();
      if (await gotoRowPage(page, schoolsPage.row(uniqueEmail))) {
        await schoolsPage.deleteSchool(uniqueEmail);
      }
    });
  });
});
