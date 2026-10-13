import { expect, test, type Page } from '@playwright/test';
import { PERSONAS, uniquePhone } from '../fixtures/instances';
import { bestEffortCleanup, loginInNewContext } from '../fixtures/session';
import { expectRowAbsentOnAllPages, expectRowOnAnyPage, gotoLibrary, gotoRowPage, login } from '../helpers';

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

async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByText('Saved.')).toBeVisible({ timeout: 10000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('content creator CRUD (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();
  const updatedName = `test-content-creator-updated-${Date.now()}`;

  test('TC-CC-001 new content creator registration', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await gotoLibrary(page);
    await openTeachers(page);

    await registerUser(page, { name: 'test-content-creator-e2e', phone, password: 'Test@123', role: 'content_creator' });

    await expectSaved(page);
    await expectRowOnAnyPage(page, teacherRow(page, phone));
  });

  test('TC-CC-002 content creator registration fails for a duplicate phone number', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await gotoLibrary(page);
    await openTeachers(page);

    await registerUser(page, {
      name: 'test-content-creator-e2e-retry',
      phone,
      password: 'Test@123',
      role: 'content_creator',
    });

    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Add teacher' })).toBeVisible();
    await expect(modal.getByRole('alert')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 5000 });
    await gotoRowPage(page, teacherRow(page, phone));
    await expect(teacherRow(page, phone)).toHaveCount(1);
  });

  test('TC-CC-003 content creator update', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await gotoLibrary(page);
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
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await gotoLibrary(page);
    await openTeachers(page);

    await removeTeacher(page, phone);
    await expectRowAbsentOnAllPages(page, teacherRow(page, phone));
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.school, async (page: Page) => {
      await gotoLibrary(page);
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
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await gotoLibrary(page);
    await openTeachers(page);
    await registerUser(page, { name: 'test-cc-transfer-e2e', phone, password: 'Test@123', role: 'content_creator' });
    await expectSaved(page);

    await gotoRowPage(page, teacherRow(page, phone));
    await teacherRow(page, phone).first().getByRole('button', { name: 'Transfer' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Target school').click();
    await page.getByRole('option', { name: 'A4I IIITB' }).click();
    await modal.getByRole('button', { name: 'Transfer' }).click();
    await page.keyboard.press('Escape');
    await expectRowAbsentOnAllPages(page, teacherRow(page, phone));

    const { context: a4iContext, page: a4iPage } = await loginInNewContext(
      browser,
      PERSONAS.schoolA4I.identifier,
      PERSONAS.schoolA4I.password,
    );
    await gotoLibrary(a4iPage);
    await openTeachers(a4iPage);
    await expectRowOnAnyPage(a4iPage, teacherRow(a4iPage, phone));

    await removeTeacher(a4iPage, phone);
    await expectRowAbsentOnAllPages(a4iPage, teacherRow(a4iPage, phone));
    await a4iContext.close();
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.schoolA4I, async (page: Page) => {
      await gotoLibrary(page);
      await openTeachers(page);
      if (await gotoRowPage(page, teacherRow(page, phone))) {
        await removeTeacher(page, phone);
      }
    });
    await bestEffortCleanup(browser, PERSONAS.school, async (page: Page) => {
      await gotoLibrary(page);
      await openTeachers(page);
      if (await gotoRowPage(page, teacherRow(page, phone))) {
        await removeTeacher(page, phone);
      }
    });
  });
});
