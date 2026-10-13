import { expect, test, type Page } from '@playwright/test';
import { PERSONAS, uniquePhone } from '../fixtures/instances';
import { bestEffortCleanup, loginInNewContext } from '../fixtures/session';
import { expectRowAbsentOnAllPages, expectRowOnAnyPage, gotoRowPage } from '../pages/pagination';
import { ContentPage } from '../pages/ContentPage';
async function loginAs(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Phone number or email').fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
}

// v2 registration UI (/registration → Teachers tab → TeacherFormModal modal).
// tr + exact-text (same as TeachersPage.row): 'table tbody tr' + hasText
// substring-matches and can resolve to a row without the expected action.
function teacherRow(page: Page, phone: string) {
  return page.locator('tr', { has: page.getByText(phone, { exact: true }) });
}

async function openTeachers(page: Page): Promise<void> {
  await page.goto('/registration');
  await page.getByRole('heading', { name: 'Teachers' }).waitFor({ timeout: 15000 });
}

async function registerUser(
  page: Page,
  opts: { name: string; phone: string; password: string; role?: 'teacher' | 'content_creator' },
): Promise<void> {
  await page.getByRole('button', { name: 'Add teacher' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Name *', { exact: true }).fill(opts.name);
  await modal.getByLabel('Phone number *', { exact: true }).fill(opts.phone);
  await modal.getByLabel('Password *', { exact: true }).fill(opts.password);
  if (opts.role === 'content_creator') {
    await modal.getByLabel('Role', { exact: true }).click();
    await page.getByRole('option', { name: 'Creator' }).click();
  }
  await modal.getByRole('button', { name: 'Save' }).click();
}

async function removeTeacher(page: Page, phone: string): Promise<void> {
  await gotoRowPage(page, teacherRow(page, phone));
  await teacherRow(page, phone).first().getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
}

// v2 reports register/update via a single 'Saved.' notification
// (registration.saved), not the legacy per-role success strings.
async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByText('Saved.')).toBeVisible({ timeout: 10000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('content creator CRUD (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();
  const updatedName = `test-content-creator-updated-${Date.now()}`;

  test('TC-CC-001 new content creator registration', async ({ page }) => {
    const contentPage = new ContentPage(page);

    await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await openTeachers(page);

    await registerUser(page, { name: 'test-content-creator-e2e', phone, password: 'Test@123', role: 'content_creator' });

    await expectSaved(page);
    await expectRowOnAnyPage(page, teacherRow(page, phone));
  });

  test('TC-CC-002 content creator registration fails for a duplicate phone number', async ({ page }) => {
    const contentPage = new ContentPage(page);

    await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await openTeachers(page);

    await registerUser(page, {
      name: 'test-content-creator-e2e-retry',
      phone,
      password: 'Test@123',
      role: 'content_creator',
    });

    // FormModal keeps the modal open with the server error in an Alert —
    // assert the failure behaviorally (message text is backend-defined).
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Add teacher' })).toBeVisible();
    await expect(modal.getByRole('alert')).toBeVisible({ timeout: 10000 });
    // Close the dialog before paging: the modal overlay intercepts pager clicks.
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 5000 });
    await gotoRowPage(page, teacherRow(page, phone));
    await expect(teacherRow(page, phone)).toHaveCount(1);
  });

  test('TC-CC-003 content creator update', async ({ page }) => {
    const contentPage = new ContentPage(page);

    await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await openTeachers(page);

    await gotoRowPage(page, teacherRow(page, phone));
    await teacherRow(page, phone).first().getByRole('button', { name: 'Edit' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Name *', { exact: true }).fill(updatedName);
    await modal.getByRole('button', { name: 'Save' }).click();

    await expectSaved(page);
    await gotoRowPage(page, teacherRow(page, phone));
    await expect(teacherRow(page, phone).first()).toContainText(updatedName);
  });

  test('TC-CC-004 content creator deletion', async ({ page }) => {
    const contentPage = new ContentPage(page);

    await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await openTeachers(page);

    // v2 delete shows no success notification — the row disappearing is the assertion.
    await removeTeacher(page, phone);
    await expectRowAbsentOnAllPages(page, teacherRow(page, phone));
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.school, async (page: Page) => {
      await new ContentPage(page).waitForLoad();
      await openTeachers(page);
      if (await gotoRowPage(page, teacherRow(page, phone))) {
        await removeTeacher(page, phone);
      }
    });
  });
});

test.describe('content creator transfer (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();

  test('TC-CC-005 content creator transfer between schools', async ({ page, browser }) => {
    const contentPage = new ContentPage(page);

    await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await contentPage.waitForLoad();
    await openTeachers(page);
    await registerUser(page, { name: 'test-cc-transfer-e2e', phone, password: 'Test@123', role: 'content_creator' });
    await expectSaved(page);

    await gotoRowPage(page, teacherRow(page, phone));
    await teacherRow(page, phone).first().getByRole('button', { name: 'Transfer' }).click();
    const modal = page.getByRole('dialog');
    // Target-school options come from the schools API.
    await modal.getByLabel('Target school').click();
    await page.getByRole('option', { name: 'A4I IIITB' }).click();
    await modal.getByRole('button', { name: 'Transfer' }).click();
    // Transfer success text is backend-defined — assert the row movement instead.
    // Dismiss the modal if a failed submit left it open (overlay blocks pager).
    await page.keyboard.press('Escape');
    await expectRowAbsentOnAllPages(page, teacherRow(page, phone));

    // Fresh context for A4I IIITB rather than logout+relogin (legacy
    // fixtures/session.js pattern).
    const { context: a4iContext, page: a4iPage } = await loginInNewContext(
      browser,
      PERSONAS.schoolA4I.identifier,
      PERSONAS.schoolA4I.password,
    );
    await new ContentPage(a4iPage).waitForLoad();
    await openTeachers(a4iPage);
    await expectRowOnAnyPage(a4iPage, teacherRow(a4iPage, phone));

    await removeTeacher(a4iPage, phone);
    await expectRowAbsentOnAllPages(a4iPage, teacherRow(a4iPage, phone));
    await a4iContext.close();
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.schoolA4I, async (page: Page) => {
      await new ContentPage(page).waitForLoad();
      await openTeachers(page);
      if (await gotoRowPage(page, teacherRow(page, phone))) {
        await removeTeacher(page, phone);
      }
    });
    await bestEffortCleanup(browser, PERSONAS.school, async (page: Page) => {
      await new ContentPage(page).waitForLoad();
      await openTeachers(page);
      if (await gotoRowPage(page, teacherRow(page, phone))) {
        await removeTeacher(page, phone);
      }
    });
  });
});
