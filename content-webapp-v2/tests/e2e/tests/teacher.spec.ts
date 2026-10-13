import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { PERSONAS, uniquePhone } from '../fixtures/instances';
import { bestEffortCleanup, loginInNewContext } from '../fixtures/session';
import { expectRowAbsentOnAllPages, expectRowOnAnyPage, gotoRowPage, login } from '../helpers';

// Mantine TextInputs are controlled — verify the fill landed before proceeding.
async function fillAndVerify(locator: Locator, value: string, attempts = 3): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    await locator.fill(value);
    if ((await locator.inputValue()) === value) return;
  }
  throw new Error(`fillAndVerify: "${value}" didn't stick after ${attempts} attempts`);
}

const ROLE_LABELS: Record<string, string> = {
  teacher: 'Teacher',
  content_creator: 'Creator',
};

// Arm the wait for the table's own GET before navigating, so it can't resolve
// too early or miss it. A failed list fetch fails here with a clear cause.
async function openTeachers(page: Page): Promise<void> {
  const teachersFetched = page.waitForResponse(
    (res) => res.url().includes('/school/teachers') && res.request().method() === 'GET',
    { timeout: 10000 },
  );
  await page.getByRole('link', { name: 'Registration' }).click();
  await page.getByRole('tab', { name: 'Teachers' }).click();
  await page.getByRole('button', { name: 'Add teacher' }).waitFor();
  const res = await teachersFetched;
  if (!res.ok()) {
    throw new Error(`openTeachers(): teachers list fetch failed with status ${res.status()}`);
  }
}

function teacherDialog(page: Page): Locator {
  return page.getByRole('dialog');
}

function teacherRow(page: Page, phone: string): Locator {
  return page.locator('tr', { has: page.getByText(phone, { exact: true }) });
}

async function registerTeacher(
  page: Page,
  { name, phone, password, role = 'teacher' }: { name: string; phone: string; password: string; role?: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Add teacher' }).click();
  const dialog = teacherDialog(page);
  await dialog.getByLabel('Name *', { exact: true }).fill(name);
  await fillAndVerify(dialog.getByLabel('Phone number *', { exact: true }), phone);
  // Create dialog holds exactly one password input (edit dialog's is optional).
  await dialog.locator('input[type="password"]').fill(password);
  // Create form defaults to teacher — touch the Mantine combobox only for a non-default role.
  if (role !== 'teacher') {
    await dialog.getByLabel('Role', { exact: true }).click();
    await page.getByRole('option', { name: ROLE_LABELS[role] ?? role, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
}

async function editTeacher(page: Page, phone: string): Promise<void> {
  await gotoRowPage(page, teacherRow(page, phone));
  await teacherRow(page, phone).getByRole('button', { name: 'Edit', exact: true }).click();
  await teacherDialog(page).getByLabel('Name *', { exact: true }).waitFor();
}

async function saveEdit(page: Page, name: string): Promise<void> {
  const dialog = teacherDialog(page);
  await dialog.getByLabel('Name *', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
}

async function deleteTeacher(page: Page, phone: string): Promise<void> {
  await gotoRowPage(page, teacherRow(page, phone));
  await teacherRow(page, phone).getByRole('button', { name: 'Remove', exact: true }).click();
  // v2 delete goes through a Mantine confirm modal (not window.confirm).
  await teacherDialog(page).getByRole('button', { name: 'Remove', exact: true }).click();
}

async function transferTeacher(page: Page, phone: string, targetSchoolName: string): Promise<void> {
  await gotoRowPage(page, teacherRow(page, phone));
  await teacherRow(page, phone).getByRole('button', { name: 'Transfer', exact: true }).click();
  const dialog = teacherDialog(page);
  await dialog.getByLabel('Target school', { exact: true }).click();
  await page.getByRole('option', { name: targetSchoolName, exact: true }).click();
  await dialog.getByRole('button', { name: 'Transfer', exact: true }).click();
}

// IDEMPOTENCY: two generated phone numbers keep the CRUD chain and the transfer
// chain independent and self-cleaning. TC-TCHR-006 permanently moves the teacher
// to another school (no undo), so its block deletes it from the destination school.
test.describe.configure({ mode: 'serial' });

test('TC-TCHR-001 existing teachers and content creators are listed for a school', async ({ page }) => {
  await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
  await openTeachers(page);

  await expectRowOnAnyPage(page, teacherRow(page, '9717503152'));
  await expectRowOnAnyPage(page, teacherRow(page, '8904954840'));
});

test.describe('teacher CRUD (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();
  const updatedName = `test-teacher-updated-${Date.now()}`;

  test('TC-TCHR-002 new teacher registration', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openTeachers(page);
    await registerTeacher(page, { name: 'test-teacher-e2e', phone, password: 'Test@123' });

    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10000 });
    await expectRowOnAnyPage(page, teacherRow(page, phone));
  });

  test('TC-TCHR-003 teacher registration fails for a duplicate phone number', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openTeachers(page);
    await registerTeacher(page, { name: 'test-teacher-e2e-retry', phone, password: 'Test@123' });

    // v2 surfaces the 409 as an Alert inside the still-open dialog.
    await expect(teacherDialog(page).getByText(/already exists/i)).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await expect(teacherDialog(page)).toBeHidden({ timeout: 5000 });
    await gotoRowPage(page, teacherRow(page, phone));
    await expect(teacherRow(page, phone)).toHaveCount(1);
  });

  test('TC-TCHR-004 teacher update', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openTeachers(page);
    await editTeacher(page, phone);
    await saveEdit(page, updatedName);

    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10000 });
    await gotoRowPage(page, teacherRow(page, phone));
    await expect(teacherRow(page, phone)).toContainText(updatedName);
  });

  test('TC-TCHR-005 teacher deletion', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openTeachers(page);
    await deleteTeacher(page, phone);

    await expectRowAbsentOnAllPages(page, teacherRow(page, phone));
  });

  test('TC-TCHR-007 teacher registration is blocked for an invalid phone number', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openTeachers(page);
    // zod resolver throws on invalid data so no inline error renders; assert blocked submit instead.
    let teacherMutations = 0;
    await page.route('**/teacher*', async (route) => {
      if (route.request().method() === 'POST') teacherMutations++;
      await route.continue();
    });
    await page.getByRole('button', { name: 'Add teacher' }).click();
    const dialog = teacherDialog(page);
    await dialog.getByLabel('Name *', { exact: true }).fill('test-teacher-bad-phone');
    await dialog.getByLabel('Phone number *', { exact: true }).fill('12345');
    await dialog.locator('input[type="password"]').fill('Test@123');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(1000);
    expect(teacherMutations).toBe(0);
    await page.unroute('**/teacher*');
    await expect(teacherDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(teacherDialog(page)).toBeHidden({ timeout: 5000 });
    await expectRowAbsentOnAllPages(page, teacherRow(page, '12345'));
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.school, async (page) => {
      await openTeachers(page);
      if (await gotoRowPage(page, teacherRow(page, phone))) {
        await deleteTeacher(page, phone);
      }
    });
  });
});

test.describe('teacher transfer (unique per run, self-cleaning)', () => {
  const phone = uniquePhone();

  test('TC-TCHR-006 teacher transfer between schools', async ({ page, browser }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openTeachers(page);
    await registerTeacher(page, { name: 'test-teacher-transfer-e2e', phone, password: 'Test@123' });
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 10000 });

    await transferTeacher(page, phone, 'A4I IIITB');
    await expect(page.getByText('Teacher transferred successfully')).toBeVisible({ timeout: 10000 });
    await expectRowAbsentOnAllPages(page, teacherRow(page, phone));

    // A fresh context for A4I IIITB rather than logout+relogin on the same page —
    // logout right after a mutating action was found to silently re-authenticate
    // before the login form ever rendered (refresh-token leak, A4i-tech/.github#591).
    const { context: a4iContext, page: a4iPage } = await loginInNewContext(
      browser,
      PERSONAS.schoolA4I.identifier,
      PERSONAS.schoolA4I.password,
    );
    await openTeachers(a4iPage);
    await expectRowOnAnyPage(a4iPage, teacherRow(a4iPage, phone));

    // No "transfer back" affordance in the product — delete from the destination school.
    await deleteTeacher(a4iPage, phone);
    await expectRowAbsentOnAllPages(a4iPage, teacherRow(a4iPage, phone));
    await a4iContext.close();
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.schoolA4I, async (page) => {
      await openTeachers(page);
      if (await gotoRowPage(page, teacherRow(page, phone))) {
        await deleteTeacher(page, phone);
      }
    });
    await bestEffortCleanup(browser, PERSONAS.school, async (page) => {
      await openTeachers(page);
      if (await gotoRowPage(page, teacherRow(page, phone))) {
        await deleteTeacher(page, phone);
      }
    });
  });
});
