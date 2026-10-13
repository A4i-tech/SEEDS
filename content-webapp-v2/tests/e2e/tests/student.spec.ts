import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { PERSONAS, uniquePhone } from '../fixtures/instances';
import { expectRowAbsentOnAllPages, expectRowOnAnyPage, gotoRowPage } from '../pages/pagination';
import { StudentsPage } from '../pages/StudentsPage';

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

// Self-contained + self-cleaning: two generated phones per run (phoneA for the CRUD
// chain, phoneB as TC-STU-006's collision target); assertions check HTTP status + row state.
test.describe.configure({ mode: 'serial' });

let origin = '';

test('TC-STU-001 existing students are listed for a school', async ({ page }) => {
  const studentsPage = new StudentsPage(page);

  origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
  await studentsPage.open();

  await expectRowOnAnyPage(page, studentsPage.row('7567071072'));
  await expectRowOnAnyPage(page, studentsPage.row('9012345700'));
});

test.describe('student CRUD (unique per run, self-cleaning)', () => {
  const phoneA = uniquePhone();
  const phoneB = uniquePhone();
  const phoneANew = uniquePhone();
  const updatedName = `test-student-updated-${Date.now()}`;

  test('TC-STU-002 new student registration', async ({ page }) => {
    const studentsPage = new StudentsPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await studentsPage.open();

    const status = await studentsPage.addStudent('test-student-e2e', phoneA);

    expect(status).toBe(201);
    await expectRowOnAnyPage(page, studentsPage.row(phoneA));
  });

  test('TC-STU-003 student re-registration fails for a duplicate phone number', async ({ page }) => {
    const studentsPage = new StudentsPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await studentsPage.open();

    const status = await studentsPage.addStudent('test-student-e2e-retry', phoneA);

    expect(status).toBeGreaterThanOrEqual(400);
    // The failed submit leaves the dialog open — close it before paging, as
    // the modal overlay intercepts pager clicks.
    await page.keyboard.press('Escape');
    await expect(studentsPage.dialog()).toBeHidden({ timeout: 5000 });
    await gotoRowPage(page, studentsPage.row(phoneA));
    await expect(studentsPage.row(phoneA)).toHaveCount(1);
  });

  test('TC-STU-004 student name update', async ({ page }) => {
    const studentsPage = new StudentsPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await studentsPage.open();

    await studentsPage.editStudent(phoneA);
    const status = await studentsPage.saveEditName(updatedName);

    expect(status).toBe(200);
    await gotoRowPage(page, studentsPage.row(phoneA));
    await expect(studentsPage.row(phoneA)).toContainText(updatedName);
  });

  test('TC-STU-005 student phone number update to a new, unused number', async ({ page }) => {
    const studentsPage = new StudentsPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await studentsPage.open();

    await studentsPage.editStudent(phoneA);
    const status = await studentsPage.saveEditPhone(phoneANew);

    expect(status).toBe(200);
    await expectRowOnAnyPage(page, studentsPage.row(phoneANew));
  });

  test('TC-STU-006 student phone number update fails for an existing number', async ({ page }) => {
    const studentsPage = new StudentsPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await studentsPage.open();

    const addStatus = await studentsPage.addStudent('test-student-e2e-b', phoneB);
    expect(addStatus).toBe(201);

    await studentsPage.editStudent(phoneANew);
    const status = await studentsPage.saveEditPhone(phoneB);

    expect(status).toBeGreaterThanOrEqual(400);
    // The failed PATCH leaves the edit dialog open — close it before paging,
    // as the modal overlay intercepts pager clicks.
    await page.keyboard.press('Escape');
    await expect(studentsPage.dialog()).toBeHidden({ timeout: 5000 });
    await expectRowOnAnyPage(page, studentsPage.row(phoneANew));
  });

  test('TC-STU-007 student deletion', async ({ page }) => {
    const studentsPage = new StudentsPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await studentsPage.open();

    // Delete-confirm coverage: v2 added an explicit delete confirm for students.
    const status = await studentsPage.deleteStudent(phoneANew);
    expect(status).toBe(200);
    await expectRowAbsentOnAllPages(page, studentsPage.row(phoneANew));

    const cleanupStatus = await studentsPage.deleteStudent(phoneB);
    expect(cleanupStatus).toBe(200);
    await expectRowAbsentOnAllPages(page, studentsPage.row(phoneB));
  });

  test('TC-STU-008 student creation is blocked for an invalid phone number', async ({ page }) => {
    const studentsPage = new StudentsPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await studentsPage.open();

    // zod resolver throws on invalid data so no inline error renders; assert blocked submit instead.
    let studentMutations = 0;
    await page.route('**/student*', async (route) => {
      if (route.request().method() === 'POST') studentMutations++;
      await route.continue();
    });
    await page.getByRole('button', { name: 'Add student' }).click();
    const dialog = studentsPage.dialog();
    await dialog.getByLabel('Name *', { exact: true }).fill('test-student-bad-phone');
    await dialog.getByLabel('Phone number *', { exact: true }).fill('12345');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(1000);
    expect(studentMutations).toBe(0);
    await page.unroute('**/student*');
    await expect(studentsPage.dialog()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(studentsPage.dialog()).toBeHidden({ timeout: 5000 });
    await expectRowAbsentOnAllPages(page, studentsPage.row('12345'));
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, origin, PERSONAS.school, async (page) => {
      const studentsPage = new StudentsPage(page);
      await studentsPage.open();
      for (const phone of [phoneA, phoneANew, phoneB]) {
        if (await gotoRowPage(page, studentsPage.row(phone))) {
          await studentsPage.deleteStudent(phone);
        }
      }
    });
  });
});
