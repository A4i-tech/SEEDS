import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { PERSONAS, uniquePhone } from '../fixtures/instances';
import { bestEffortCleanup, loginInNewContext } from '../fixtures/session';
import { expectRowAbsentOnAllPages, expectRowOnAnyPage, gotoRowPage, login } from '../helpers';

// Both phone inputs are controlled with per-keystroke handling — verify the fill landed, retrying if not.
async function fillAndVerify(locator: Locator, value: string, attempts = 3): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    await locator.fill(value);
    if ((await locator.inputValue()) === value) return;
  }
  throw new Error(`fillAndVerify: "${value}" didn't stick after ${attempts} attempts`);
}

// Await the students list GET so callers never race the initial fetch; deliberately not swallowed.
async function openStudents(page: Page): Promise<void> {
  const studentsFetched = page.waitForResponse(
    (res) => res.url().endsWith('/student') && res.request().method() === 'GET',
    { timeout: 10000 },
  );
  await page.getByRole('link', { name: 'Registration' }).click();
  await page.getByRole('tab', { name: 'Students' }).click();
  await page.getByRole('button', { name: 'Add student' }).waitFor();
  await studentsFetched;
}

function studentsDialog(page: Page): Locator {
  return page.getByRole('dialog');
}

function studentsRow(page: Page, phone: string): Locator {
  return page.locator('tr', { has: page.getByText(phone, { exact: true }) });
}

async function addStudent(page: Page, name: string, phone: string): Promise<number> {
  const response = page.waitForResponse(
    (res) => res.url().endsWith('/student') && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Add student' }).click();
  const dialog = studentsDialog(page);
  await dialog.getByLabel('Name *', { exact: true }).fill(name);
  await fillAndVerify(dialog.getByLabel('Phone number *', { exact: true }), phone);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  return (await response).status();
}

async function editStudent(page: Page, phone: string): Promise<void> {
  await gotoRowPage(page, studentsRow(page, phone));
  await studentsRow(page, phone).getByRole('button', { name: 'Edit', exact: true }).click();
  await studentsDialog(page).getByLabel('Name *', { exact: true }).waitFor();
}

async function saveEditName(page: Page, name: string): Promise<number> {
  const response = page.waitForResponse(
    (res) => /\/student\//.test(res.url()) && res.request().method() === 'PATCH',
  );
  const dialog = studentsDialog(page);
  await dialog.getByLabel('Name *', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  return (await response).status();
}

async function saveEditPhone(page: Page, phone: string): Promise<number> {
  const response = page.waitForResponse(
    (res) => /\/student\//.test(res.url()) && res.request().method() === 'PATCH',
  );
  const dialog = studentsDialog(page);
  await fillAndVerify(dialog.getByLabel('Phone number *', { exact: true }), phone);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  return (await response).status();
}

async function deleteStudent(page: Page, phone: string): Promise<number> {
  await gotoRowPage(page, studentsRow(page, phone));
  const response = page.waitForResponse(
    (res) => /\/student\//.test(res.url()) && res.request().method() === 'DELETE',
  );
  await studentsRow(page, phone).getByRole('button', { name: 'Delete', exact: true }).click();
  // v2 delete goes through a Mantine confirm modal (legacy had no confirm for students).
  await studentsDialog(page).getByRole('button', { name: 'Delete', exact: true }).click();
  return (await response).status();
}

// Self-contained + self-cleaning: two generated phones per run (phoneA for the CRUD chain, phoneB as TC-STU-006's collision target).
test.describe.configure({ mode: 'serial' });

test('TC-STU-001 existing students are listed for a school', async ({ page }) => {
  await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
  await openStudents(page);

  await expectRowOnAnyPage(page, studentsRow(page, '7567071072'));
  await expectRowOnAnyPage(page, studentsRow(page, '9012345700'));
});

test.describe('student CRUD (unique per run, self-cleaning)', () => {
  const phoneA = uniquePhone();
  const phoneB = uniquePhone();
  const phoneANew = uniquePhone();
  const updatedName = `test-student-updated-${Date.now()}`;

  test('TC-STU-002 new student registration', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openStudents(page);

    const status = await addStudent(page, 'test-student-e2e', phoneA);

    expect(status).toBe(201);
    await expectRowOnAnyPage(page, studentsRow(page, phoneA));
  });

  test('TC-STU-003 student re-registration fails for a duplicate phone number', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openStudents(page);

    const status = await addStudent(page, 'test-student-e2e-retry', phoneA);

    expect(status).toBeGreaterThanOrEqual(400);
    // Close the dialog before paging: the modal overlay intercepts pager clicks.
    await page.keyboard.press('Escape');
    await expect(studentsDialog(page)).toBeHidden({ timeout: 5000 });
    await gotoRowPage(page, studentsRow(page, phoneA));
    await expect(studentsRow(page, phoneA)).toHaveCount(1);
  });

  test('TC-STU-004 student name update', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openStudents(page);

    await editStudent(page, phoneA);
    const status = await saveEditName(page, updatedName);

    expect(status).toBe(200);
    await gotoRowPage(page, studentsRow(page, phoneA));
    await expect(studentsRow(page, phoneA)).toContainText(updatedName);
  });

  test('TC-STU-005 student phone number update to a new, unused number', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openStudents(page);

    await editStudent(page, phoneA);
    const status = await saveEditPhone(page, phoneANew);

    expect(status).toBe(200);
    await expectRowOnAnyPage(page, studentsRow(page, phoneANew));
  });

  test('TC-STU-006 student phone number update fails for an existing number', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openStudents(page);

    const addStatus = await addStudent(page, 'test-student-e2e-b', phoneB);
    expect(addStatus).toBe(201);

    await editStudent(page, phoneANew);
    const status = await saveEditPhone(page, phoneB);

    expect(status).toBeGreaterThanOrEqual(400);
    // Close the dialog before paging: the modal overlay intercepts pager clicks.
    await page.keyboard.press('Escape');
    await expect(studentsDialog(page)).toBeHidden({ timeout: 5000 });
    await expectRowOnAnyPage(page, studentsRow(page, phoneANew));
  });

  test('TC-STU-007 student deletion', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openStudents(page);

    // Delete-confirm coverage: v2 added an explicit delete confirm for students.
    const status = await deleteStudent(page, phoneANew);
    expect(status).toBe(200);
    await expectRowAbsentOnAllPages(page, studentsRow(page, phoneANew));

    const cleanupStatus = await deleteStudent(page, phoneB);
    expect(cleanupStatus).toBe(200);
    await expectRowAbsentOnAllPages(page, studentsRow(page, phoneB));
  });

  test('TC-STU-008 student creation is blocked for an invalid phone number', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await openStudents(page);

    // zod resolver throws on invalid data so no inline error renders; assert blocked submit instead.
    let studentMutations = 0;
    await page.route('**/student*', async (route) => {
      if (route.request().method() === 'POST') studentMutations++;
      await route.continue();
    });
    await page.getByRole('button', { name: 'Add student' }).click();
    const dialog = studentsDialog(page);
    await dialog.getByLabel('Name *', { exact: true }).fill('test-student-bad-phone');
    await dialog.getByLabel('Phone number *', { exact: true }).fill('12345');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(1000);
    expect(studentMutations).toBe(0);
    await page.unroute('**/student*');
    await expect(studentsDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(studentsDialog(page)).toBeHidden({ timeout: 5000 });
    await expectRowAbsentOnAllPages(page, studentsRow(page, '12345'));
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.school, async (page) => {
      await openStudents(page);
      for (const phone of [phoneA, phoneANew, phoneB]) {
        if (await gotoRowPage(page, studentsRow(page, phone))) {
          await deleteStudent(page, phone);
        }
      }
    });
  });
});
