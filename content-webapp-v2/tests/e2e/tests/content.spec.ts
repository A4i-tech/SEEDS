import { expect, test, type Page } from '@playwright/test';
import { PERSONAS, uniqueId, uniquePhone } from '../fixtures/instances';
import { bestEffortCleanup, loginInNewContext } from '../fixtures/session';
import {
  TEST_TEXT_PATH,
  deleteContent,
  deleteEitherId,
  expectRowAbsentOnAllPages,
  expectRowOnAnyPage,
  fillStoryForm,
  gotoLibrary,
  gotoRowPage,
  gotoUpload,
  isLibraryRowVisible,
  libraryRow,
  libraryUpdateIvrButton,
  login,
  saveUpload,
  searchLibrary,
  selectExperience,
  selectLanguage,
  updateContentTitle,
  viewContent,
  waitForLibraryRow,
  waitUntilContentProcessed,
} from '../helpers';

function teacherRow(page: Page, phone: string) {
  return page.locator('table tbody tr', { hasText: phone });
}

async function openTeachers(page: Page): Promise<void> {
  await page.goto('/registration');
  await page.getByRole('heading', { name: 'Teachers' }).waitFor({ timeout: 15000 });
}

async function registerTeacher(
  page: Page,
  opts: { name: string; phone: string; password: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Add teacher' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Name *', { exact: true }).fill(opts.name);
  await modal.getByLabel('Phone number *', { exact: true }).fill(opts.phone);
  await modal.getByLabel('Password *', { exact: true }).fill(opts.password);
  await modal.getByRole('button', { name: 'Save' }).click();
}

// waitForLibraryRow()/waitUntilContentProcessed() poll for up to 60-120s by
// design — content processing is a slow async backend job. Every test here
// either calls one of those directly or is fast enough that a higher ceiling
// costs nothing.
test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(Math.max(testInfo.timeout, 180000));
});

// IDEMPOTENCY NOTE: every created content item is deleted at the end of its own
// block. Row lookups use a short numeric suffix (uniqueId()) — v2 renders full
// titles (no legacy MiddleEllipsis truncation), but suffix matching stays robust.
test.describe.configure({ mode: 'serial' });

test('TC-CONT-001 tenant can view existing content', async ({ page }) => {
  await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await gotoLibrary(page);

  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
});

test.describe('tenant content lifecycle: create, cross-school visibility, update, delete', () => {
  const id = uniqueId();
  const updatedId = uniqueId();

  test('TC-CONT-002 tenant can create content', async ({ page }) => {
    await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await gotoLibrary(page);
    await gotoUpload(page);
    await selectExperience(page, 'Song');
    await fillStoryForm(page, { title: `tmp-add-new-song-${id}`, theme: `theme-${id}` });
    const status = await saveUpload(page);
    expect(status).toBe(201);

    await waitForLibraryRow(page, id);
    await viewContent(page, id);
    // Legacy detail URL was /content/detail/:id; v2 is /library/:kind/:id.
    expect(new URL(page.url()).pathname).toContain('/library/');
  });

  test('TC-CONT-003 content created by a tenant is visible to school@test-a4i.local', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await gotoLibrary(page);
    await waitForLibraryRow(page, id);
  });

  test('TC-CONT-004 content created by a tenant is visible to a4itestschool@iiitb.ac.in', async ({ page }) => {
    await login(page, PERSONAS.schoolA4I.identifier, PERSONAS.schoolA4I.password);
    await gotoLibrary(page);
    await waitForLibraryRow(page, id);
  });

  // NOTE (see legacy TC-CONT-005 note): an edit's title change was observed
  // taking minutes (or longer) to propagate — asserts only the PATCH status
  // plus continued visibility of the pre-edit title, never propagation.
  test('TC-CONT-005 tenant content update — PATCH accepted (200); propagation not asserted, see note above', async ({
    page,
    browser,
  }) => {
    await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
    await gotoLibrary(page);
    await waitUntilContentProcessed(page, id);
    const status = await updateContentTitle(page, `tmp-add-new-song-${updatedId}`);
    expect(status).toBe(200);

    // Fresh context for a4itestschool rather than logout+relogin — legacy
    // fixtures/session.js pattern (logout right after a mutating action can
    // silently re-authenticate before the login form renders).
    const { context: a4iContext, page: a4iPage } = await loginInNewContext(
      browser,
      PERSONAS.schoolA4I.identifier,
      PERSONAS.schoolA4I.password,
    );
    await gotoLibrary(a4iPage);
    await expect(libraryRow(a4iPage, id).first()).toBeVisible({ timeout: 10000 });
    await a4iContext.close();
  });

  test('TC-CONT-006 tenant content update — pre-edit title still visible to school@test-a4i.local, then cleanup', async ({
    page,
    browser,
  }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await gotoLibrary(page);
    await expect(libraryRow(page, id).first()).toBeVisible({ timeout: 10000 });

    const { context: tenantContext, page: tenantPage } = await loginInNewContext(
      browser,
      PERSONAS.tenant.identifier,
      PERSONAS.tenant.password,
    );
    await gotoLibrary(tenantPage);
    await deleteEitherId(tenantPage, updatedId, id);
    await tenantContext.close();
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.tenant, async (page: Page) => {
      await gotoLibrary(page);
      if (await isLibraryRowVisible(page, updatedId)) {
        await deleteContent(page, updatedId);
      } else if (await isLibraryRowVisible(page, id)) {
        await deleteContent(page, id);
      }
    });
  });
});

test('TC-CONT-007 school can view existing content (school@test-a4i.local)', async ({ page }) => {
  await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
  await gotoLibrary(page);
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
});

test('TC-CONT-008 school can view existing content (a4itestschool@iiitb.ac.in)', async ({ page }) => {
  await login(page, PERSONAS.schoolA4I.identifier, PERSONAS.schoolA4I.password);
  await gotoLibrary(page);
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
});

test.describe('school content lifecycle + isolation (unique per run, self-cleaning)', () => {
  const schoolId = uniqueId();
  const a4iId = uniqueId();
  const updatedId = uniqueId();

  test('TC-CONT-009 school can create content', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await gotoLibrary(page);
    await gotoUpload(page);
    await selectExperience(page, 'Song');
    await fillStoryForm(page, { title: `school-test-a4i-content-${schoolId}`, theme: `theme-${schoolId}` });
    const status = await saveUpload(page);
    expect(status).toBe(201);

    await waitForLibraryRow(page, schoolId);
  });

  test('TC-CONT-010 content isolation: a4itestschool content is hidden from school@test-a4i.local', async ({
    page,
    browser,
  }) => {
    // Create a4itestschool's own content first (needed for TC-CONT-011 too).
    await login(page, PERSONAS.schoolA4I.identifier, PERSONAS.schoolA4I.password);
    await gotoLibrary(page);
    await gotoUpload(page);
    await selectExperience(page, 'Song');
    await fillStoryForm(page, { title: `a4i-content-${a4iId}`, theme: `theme-${a4iId}` });
    const status = await saveUpload(page);
    expect(status).toBe(201);
    await waitForLibraryRow(page, a4iId);

    // Fresh context for school@test-a4i.local (mutating action just happened).
    const { context: schoolContext, page: schoolPage } = await loginInNewContext(
      browser,
      PERSONAS.school.identifier,
      PERSONAS.school.password,
    );
    await gotoLibrary(schoolPage);
    await searchLibrary(schoolPage, a4iId);
    await expect(libraryRow(schoolPage, a4iId)).toHaveCount(0);
    await schoolContext.close();
  });

  test('TC-CONT-011 content isolation: school@test-a4i.local content is hidden from a4itestschool', async ({
    page,
  }) => {
    await login(page, PERSONAS.schoolA4I.identifier, PERSONAS.schoolA4I.password);
    await gotoLibrary(page);
    await searchLibrary(page, schoolId);
    await expect(libraryRow(page, schoolId)).toHaveCount(0);

    await deleteContent(page, a4iId);
  });

  // See the note above TC-CONT-005 — asserts only the PATCH status.
  test('TC-CONT-012 school content update — PATCH accepted (200); propagation not asserted, see TC-CONT-005 note', async ({
    page,
  }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await gotoLibrary(page);
    await waitUntilContentProcessed(page, schoolId);
    const status = await updateContentTitle(page, `school-test-a4i-content-${updatedId}`);
    expect(status).toBe(200);
  });

  test('TC-CONT-013 school can delete content', async ({ page }) => {
    await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
    await gotoLibrary(page);
    // Cleanup by whichever id is actually showing (see TC-CONT-012 note).
    await deleteEitherId(page, updatedId, schoolId);
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.school, async (page: Page) => {
      await gotoLibrary(page);
      if (await isLibraryRowVisible(page, updatedId)) {
        await deleteContent(page, updatedId);
      } else if (await isLibraryRowVisible(page, schoolId)) {
        await deleteContent(page, schoolId);
      }
    });
    await bestEffortCleanup(browser, PERSONAS.schoolA4I, async (page: Page) => {
      await gotoLibrary(page);
      if (await isLibraryRowVisible(page, a4iId)) {
        await deleteContent(page, a4iId);
      }
    });
  });
});

test('TC-CONT-014 content creator can view existing content', async ({ page }) => {
  await login(page, PERSONAS.contentCreator.identifier, PERSONAS.contentCreator.password);
  await gotoLibrary(page);
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
});

test.describe('content creator content CRUD (unique per run, self-cleaning)', () => {
  const id = uniqueId();
  const updatedId = uniqueId();

  test('TC-CONT-015 content creator can create content', async ({ page }) => {
    await login(page, PERSONAS.contentCreator.identifier, PERSONAS.contentCreator.password);
    await gotoLibrary(page);
    await gotoUpload(page);
    await selectExperience(page, 'Song');
    await fillStoryForm(page, { title: `cc-content-${id}`, theme: `theme-${id}` });
    const status = await saveUpload(page);
    expect(status).toBe(201);

    await waitForLibraryRow(page, id);
  });

  // See the note above TC-CONT-005 — same asymmetry observed here too.
  test('TC-CONT-016 content creator content update — PATCH accepted (200); propagation not asserted, see TC-CONT-005 note', async ({
    page,
  }) => {
    await login(page, PERSONAS.contentCreator.identifier, PERSONAS.contentCreator.password);
    await gotoLibrary(page);
    await waitUntilContentProcessed(page, id);
    const status = await updateContentTitle(page, `cc-content-${updatedId}`);
    expect(status).toBe(200);
  });

  test('TC-CONT-017 content creator can delete content', async ({ page }) => {
    await login(page, PERSONAS.contentCreator.identifier, PERSONAS.contentCreator.password);
    await gotoLibrary(page);
    await deleteEitherId(page, updatedId, id);
  });

  test.afterAll(async ({ browser }) => {
    await bestEffortCleanup(browser, PERSONAS.contentCreator, async (page: Page) => {
      await gotoLibrary(page);
      if (await isLibraryRowVisible(page, updatedId)) {
        await deleteContent(page, updatedId);
      } else if (await isLibraryRowVisible(page, id)) {
        await deleteContent(page, id);
      }
    });
  });
});

test('TC-CONT-018 freshly-registered teacher appears in the teachers list', async ({ page }) => {
  const phone = uniquePhone();

  await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
  await gotoLibrary(page);
  await openTeachers(page);
  await registerTeacher(page, { name: 'test-teacher-ivr-e2e', phone, password: 'Test@123' });
  // v2 reports registration via a 'Saved.' notification (registration.saved),
  // not the legacy per-role success strings.
  await expect(page.getByText('Saved.')).toBeVisible({ timeout: 10000 });
  await expectRowOnAnyPage(page, teacherRow(page, phone));

  // v2 delete uses a confirm modal with no success notification.
  await gotoRowPage(page, teacherRow(page, phone));
  await teacherRow(page, phone).first().getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expectRowAbsentOnAllPages(page, teacherRow(page, phone));
});

// Product gap: no teacher login in v2 (LoginScreen posts only /auth/login; teachers authenticate via POST /teacher/login).
test.skip('TC-CONT-018-login freshly-registered teacher can log in', async () => {});

// addToIVR deliberately left unset (was legacy fillStoryForm addToIVR=true):
// the extra TTS job for is_pull_model content was loading the shared backend
// queue ahead of experience.spec.js (legacy #593) — and v2 sets IVR mapping on
// the edit screen, not at upload. The "map to IVR" action under test is the
// Update IVR button click below (same standalone sync trigger as legacy).
test('TC-CONT-019 content creator can create content and map it to IVR', async ({ page }) => {
  const id = uniqueId();

  await login(page, PERSONAS.contentCreator.identifier, PERSONAS.contentCreator.password);
  await gotoLibrary(page);
  await gotoUpload(page);
  await selectExperience(page, 'Song');
  await fillStoryForm(page, { title: `cc-ivr-content-${id}`, theme: `theme-${id}` });
  const status = await saveUpload(page);
  expect(status).toBe(201);
  await waitForLibraryRow(page, id);

  await libraryUpdateIvrButton(page).click();
  // v2 shows the backend message when present, else the library.ivrUpdated fallback.
  await expect(page.getByText(/updated successfully|IVR updated\./)).toBeVisible({ timeout: 15000 });

  await deleteContent(page, id);
});

// V2-only addition (no legacy counterpart — legacy had no review-queue page):
// the review queue is the v2 surface for the "view content for review" flow.
test('TC-CONT-020 tenant can open the review queue', async ({ page }) => {
  await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('tab', { name: /Pending/ })).toBeVisible();
});

// V2-only addition: the upload screen enforces .mp3-only client-side
// (CreateUploadScreen mp3 guard) — legacy had no upload-validation coverage.
test('TC-CONT-021 upload rejects non-mp3 files with an inline error', async ({ page }) => {
  await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await gotoLibrary(page);
  await gotoUpload(page);
  await selectExperience(page, 'Song');
  await selectLanguage(page, 'English');
  await page.getByLabel('Title *', { exact: true }).fill(`mp3-guard-${uniqueId()}`);
  await page.getByLabel('Theme *', { exact: true }).fill('theme-guard');
  await page.locator('input[type="file"]').setInputFiles(TEST_TEXT_PATH);
  await page.getByRole('button', { name: 'Save to Library' }).click();

  await expect(page.getByText('Only .mp3 files are allowed.')).toBeVisible({ timeout: 10000 });
  expect(new URL(page.url()).pathname).toContain('/create/upload');
});
