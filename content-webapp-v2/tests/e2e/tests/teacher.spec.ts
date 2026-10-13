import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { PERSONAS, uniquePhone } from '../fixtures/instances';
import { expectRowAbsentOnAllPages, expectRowOnAnyPage, gotoRowPage } from '../pages/pagination';
import { TeachersPage } from '../pages/TeachersPage';

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

// IDEMPOTENCY NOTE: same pattern as the legacy spec. Two independent generated
// phone numbers are used so the CRUD chain (register/duplicate/update/delete)
// and the transfer chain can each run as a self-contained, self-cleaning
// serial block. TC-TCHR-006 (transfer) permanently moves the teacher to
// another school with no undo in the product — so its block ends by deleting
// the transferred teacher from the destination school.
test.describe.configure({ mode: 'serial' });

let origin = '';

test('TC-TCHR-001 existing teachers and content creators are listed for a school', async ({ page }) => {
  const teachersPage = new TeachersPage(page);

  origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
  await teachersPage.open();

  await expectRowOnAnyPage(page, teachersPage.row('9717503152'));
  await expectRowOnAnyPage(page, teachersPage.row('8904954840'));
});

test.describe('teacher CRUD (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();
  const updatedName = `test-teacher-updated-${Date.now()}`;

  test('TC-TCHR-002 new teacher registration', async ({ page }) => {
    const teachersPage = new TeachersPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await teachersPage.open();
    await teachersPage.register({ name: 'test-teacher-e2e', phone, password: 'Test@123' });

    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10000 });
    await expectRowOnAnyPage(page, teachersPage.row(phone));
  });

  test('TC-TCHR-003 teacher registration fails for a duplicate phone number', async ({ page }) => {
    const teachersPage = new TeachersPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await teachersPage.open();
    await teachersPage.register({ name: 'test-teacher-e2e-retry', phone, password: 'Test@123' });

    // v2 surfaces the 409 as an Alert inside the still-open dialog.
    await expect(teachersPage.dialog().getByText(/already exists/i)).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await expect(teachersPage.dialog()).toBeHidden({ timeout: 5000 });
    await gotoRowPage(page, teachersPage.row(phone));
    await expect(teachersPage.row(phone)).toHaveCount(1);
  });

  test('TC-TCHR-004 teacher update', async ({ page }) => {
    const teachersPage = new TeachersPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await teachersPage.open();
    await teachersPage.editTeacher(phone);
    await teachersPage.saveEdit(updatedName);

    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10000 });
    await gotoRowPage(page, teachersPage.row(phone));
    await expect(teachersPage.row(phone)).toContainText(updatedName);
  });

  test('TC-TCHR-005 teacher deletion', async ({ page }) => {
    const teachersPage = new TeachersPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await teachersPage.open();
    await teachersPage.deleteTeacher(phone);

    await expectRowAbsentOnAllPages(page, teachersPage.row(phone));
  });

  test('TC-TCHR-007 teacher registration is blocked for an invalid phone number', async ({ page }) => {
    const teachersPage = new TeachersPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await teachersPage.open();
    // zod resolver throws on invalid data so no inline error renders; assert blocked submit instead.
    let teacherMutations = 0;
    await page.route('**/teacher*', async (route) => {
      if (route.request().method() === 'POST') teacherMutations++;
      await route.continue();
    });
    await teachersPage.addButton.click();
    const dialog = teachersPage.dialog();
    await dialog.getByLabel('Name *', { exact: true }).fill('test-teacher-bad-phone');
    await dialog.getByLabel('Phone number *', { exact: true }).fill('12345');
    await dialog.locator('input[type="password"]').fill('Test@123');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(1000);
    expect(teacherMutations).toBe(0);
    await page.unroute('**/teacher*');
    await expect(teachersPage.dialog()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(teachersPage.dialog()).toBeHidden({ timeout: 5000 });
    await expectRowAbsentOnAllPages(page, teachersPage.row('12345'));
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, origin, PERSONAS.school, async (page) => {
      const teachersPage = new TeachersPage(page);
      await teachersPage.open();
      if (await gotoRowPage(page, teachersPage.row(phone))) {
        await teachersPage.deleteTeacher(phone);
      }
    });
  });
});

test.describe('teacher transfer (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();

  test('TC-TCHR-006 teacher transfer between schools', async ({ page, browser }) => {
    const teachersPage = new TeachersPage(page);

    origin = await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await teachersPage.open();
    await teachersPage.register({ name: 'test-teacher-transfer-e2e', phone, password: 'Test@123' });
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10000 });

    await teachersPage.transferTeacher(phone, 'A4I IIITB');
    await expect(page.getByText('Teacher transferred successfully')).toBeVisible({ timeout: 10000 });
    await expectRowAbsentOnAllPages(page, teachersPage.row(phone));

    // A fresh context for A4I IIITB rather than logout+relogin on the same
    // page — logout right after a mutating action was found to silently
    // re-authenticate before the login form ever rendered (refresh-token
    // leak, A4i-tech/.github#591). A fresh context sidesteps it entirely.
    const { context: a4iContext, page: a4iPage } = await loginInNewContext(
      browser,
      origin,
      PERSONAS.schoolA4I.identifier,
      PERSONAS.schoolA4I.password,
    );
    const a4iTeachersPage = new TeachersPage(a4iPage);
    await a4iTeachersPage.open();
    await expectRowOnAnyPage(a4iPage, a4iTeachersPage.row(phone));

    // Cleanup: the product has no "transfer back" affordance, so delete the
    // teacher from the destination school to keep this run self-cleaning.
    await a4iTeachersPage.deleteTeacher(phone);
    await expectRowAbsentOnAllPages(a4iPage, a4iTeachersPage.row(phone));
    await a4iContext.close();
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, origin, PERSONAS.schoolA4I, async (page) => {
      const teachersPage = new TeachersPage(page);
      await teachersPage.open();
      if (await gotoRowPage(page, teachersPage.row(phone))) {
        await teachersPage.deleteTeacher(phone);
      }
    });
    await bestEffortCleanup(browser, origin, PERSONAS.school, async (page) => {
      const teachersPage = new TeachersPage(page);
      await teachersPage.open();
      if (await gotoRowPage(page, teachersPage.row(phone))) {
        await teachersPage.deleteTeacher(phone);
      }
    });
  });
});
