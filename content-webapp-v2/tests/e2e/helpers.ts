import * as path from 'path';
import { expect, type Locator, type Page } from '@playwright/test';

// Mantine PasswordInput renders a "Toggle password visibility" button whose
// accessible name also contains "password", so getByLabel('Password') is
// ambiguous - match the input directly.
export async function login(page: Page, identifier: string, password: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel(/phone number or email/i).fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  // Await the /auth/login round-trip: callers navigate right after, which would
  // abort the in-flight POST and bounce back to the login page. Resolves on
  // error statuses too - invalid-credential callers assert the alert themselves.
  const responded = page.waitForResponse(
    (res) => res.url().includes('/auth/login') && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await responded;
  return new URL(page.url()).origin;
}

export async function gotoLibrary(page: Page): Promise<void> {
  await page.goto('/library');
  await page.waitForURL(/\/library/, { timeout: 15000 });
  await page.getByPlaceholder(/Search by title/i).waitFor({ timeout: 15000 });
}

// --- Pager traversal (DataTable.tsx) -----------------------------------------
// range layout (teachers/students/schools/jobs): Buttons Previous/Next, disabled
// at ends. pages layout (library): nav[aria-label="Pagination"]. Paging is
// client-side (re-slices rendered rows), so clicks settle after a short pause.

const SETTLE_MS = 250;

function rangeNext(page: Page): Locator {
  return page.getByRole('button', { name: 'Next', exact: true });
}

function rangePrev(page: Page): Locator {
  return page.getByRole('button', { name: 'Previous', exact: true });
}

function pagesNav(page: Page): Locator {
  return page.locator('nav[aria-label="Pagination"]');
}

export async function gotoNextPage(page: Page): Promise<boolean> {
  const nav = pagesNav(page);
  if (await nav.count()) {
    const next = nav.getByRole('button').last();
    if ((await next.count()) === 0 || (await next.isDisabled())) return false;
    await next.click();
    await page.waitForTimeout(SETTLE_MS);
    return true;
  }
  const next = rangeNext(page);
  if ((await next.count()) === 0 || (await next.isDisabled())) return false;
  await next.click();
  await page.waitForTimeout(SETTLE_MS);
  return true;
}

export async function gotoFirstPage(page: Page, maxPages = 5): Promise<void> {
  const nav = pagesNav(page);
  if (await nav.count()) {
    const first = nav.getByRole('button', { name: '1', exact: true });
    if (await first.count()) await first.click();
    return;
  }
  const prev = rangePrev(page);
  for (let i = 0; i < maxPages; i++) {
    if ((await prev.count()) === 0 || (await prev.isDisabled())) return;
    await prev.click();
  }
}

// Walks pages from page 1 until the row matches, leaving the pager on the
// matching page so callers can click row actions.
export async function gotoRowPage(page: Page, row: Locator, maxPages = 5): Promise<boolean> {
  await gotoFirstPage(page, maxPages);
  for (let i = 0; i < maxPages; i++) {
    if (await row.count()) return true;
    if (!(await gotoNextPage(page))) return false;
  }
  return (await row.count()) > 0;
}

export async function expectRowOnAnyPage(page: Page, row: Locator, maxPages = 5): Promise<void> {
  await gotoFirstPage(page, maxPages);
  for (let i = 0; i < maxPages; i++) {
    if (await row.count()) {
      await expect(row.first()).toBeVisible();
      return;
    }
    if (!(await gotoNextPage(page))) break;
  }
  await expect(row.first()).toBeVisible();
}

export async function expectRowAbsentOnAllPages(page: Page, row: Locator, maxPages = 5): Promise<void> {
  await gotoFirstPage(page, maxPages);
  for (let i = 0; i < maxPages; i++) {
    await expect(row).toHaveCount(0);
    if (!(await gotoNextPage(page))) return;
  }
}

// --- Content upload form (/create/upload) -------------------------------------

// Legacy asset carried over verbatim: the v2 upload screen accepts .mp3 only,
// so the same fixture still exercises the happy path.
export const TEST_AUDIO_PATH = path.join(import.meta.dirname, 'fixtures', 'files', 'test-audio.mp3');
// Non-audio sibling for the .mp3-only guard test (v2 has no legacy equivalent).
export const TEST_TEXT_PATH = path.join(import.meta.dirname, 'fixtures', 'files', 'test-notes.txt');

// v2 ExperienceSelect labels come from t('library.experiences.*'); story/song/
// poem resolve to Story/Song/Poem, but 'snippet' has no such key so i18next
// falls back to the key itself ('library.experiences.snippet') — hence regexes.
const EXPERIENCE_OPTIONS: Record<string, RegExp> = {
  Story: /story/i,
  Song: /song/i,
  Poem: /poem/i,
  Snippet: /snippet/i,
};

export interface StoryFormValues {
  title: string;
  theme: string;
  language?: string;
  audioPath?: string;
  description?: string;
}

export async function gotoUpload(page: Page): Promise<void> {
  // Legacy clicked '+ Add Content' then picked an experience; v2 splits that
  // into /create (hub) + per-kind routes.
  await page.goto('/create/upload');
  await page.getByRole('heading', { name: 'Upload audio' }).waitFor({ timeout: 15000 });
}

export async function selectExperience(page: Page, label: string): Promise<void> {
  const option = EXPERIENCE_OPTIONS[label] ?? new RegExp(label, 'i');
  // getByLabel('Experience type *') strict-violates: Mantine also renders a
  // div[role=listbox][aria-labelledby] matching that label — scope to the input.
  await page.locator('input[data-path="experience"]').click();
  await page.getByRole('option', { name: option }).click();
}

export async function selectLanguage(page: Page, label: string | RegExp = /english/i): Promise<void> {
  // Same Mantine listbox double-match as selectExperience.
  await page.locator('input[data-path="language"]').click();
  await page.getByRole('option', { name: label }).click();
}

/** Fills the upload form in English (so no local-language fields are required). */
export async function fillStoryForm(
  page: Page,
  { title, theme, language = 'English', audioPath = TEST_AUDIO_PATH, description }: StoryFormValues,
): Promise<void> {
  await selectLanguage(page, new RegExp(language, 'i'));
  await page.getByLabel('Title *', { exact: true }).fill(title);
  // Local fields only render when the picked language needs them
  // (needsLocal() in src/features/create/utils/localized.ts).
  const localTitle = page.getByLabel('Title (local language) *', { exact: true });
  if (await localTitle.isVisible()) await localTitle.fill(title);
  await page.getByLabel('Theme *', { exact: true }).fill(theme);
  const localTheme = page.getByLabel('Theme (local language) *', { exact: true });
  if (await localTheme.isVisible()) await localTheme.fill(theme);
  if (description !== undefined) {
    await page.getByLabel('Description', { exact: true }).fill(description);
  }
  await page.locator('input[type="file"]').setInputFiles(audioPath);
}

// POST /content answers with a "job scheduled" message, not the finished record
// (same async backend as legacy) — callers poll the library afterward.
// v2 adds a confirm modal ('Save this upload?') between submit and upload.
export async function saveUpload(page: Page): Promise<number> {
  const responsePromise = page.waitForResponse(
    (res) => /\/content(\/|$|\?)/.test(res.url()) && ['POST', 'PATCH'].includes(res.request().method()),
  );
  await page.getByRole('button', { name: 'Save to Library' }).click();
  const confirm = page.getByRole('button', { name: 'Save upload' });
  if (await confirm.isVisible()) await confirm.click();
  const response = await responsePromise;
  return response.status();
}

// --- Content library (/library) -----------------------------------------------

const FIRST_PAGE_CHECK_MS = 3000;

interface PollOptions {
  timeout?: number;
  interval?: number;
}

export function libraryRow(page: Page, title: string): Locator {
  return page.locator('table tbody tr', { hasText: title });
}

export function libraryUpdateIvrButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Update IVR' });
}

/**
 * A confirm modal from an earlier step (e.g. a delete whose confirm click never
 * landed) survives client-side navigation — ModalsProvider sits at the app root
 * — and its overlay/focus trap blocks later search fills. Dismissing here is
 * always safe: these helpers open no modals of their own.
 */
async function dismissStrayDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  const open = await dialog
    .waitFor({ state: 'visible', timeout: 500 })
    .then(() => true)
    .catch(() => false);
  if (!open) return;
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}

export async function searchLibrary(page: Page, term: string): Promise<void> {
  await dismissStrayDialog(page);
  await page.getByPlaceholder(/Search by title/i).fill(term);
}

export async function isLibraryRowVisible(
  page: Page,
  title: string,
  timeout = FIRST_PAGE_CHECK_MS,
): Promise<boolean> {
  // Unlike legacy (paginated table scan), v2 filters client-side, so narrow via
  // search first — strictly more coverage than a first-page check.
  await searchLibrary(page, title);
  return libraryRow(page, title)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

/**
 * Content creation is async — POST returns a job_id, not the finished record —
 * so a new row can take seconds to minutes to appear. Reloads and rechecks via
 * the search filter, which covers the whole library (no "Load more" fallback).
 */
export async function waitForLibraryRow(
  page: Page,
  title: string,
  { timeout = 60000, interval = 5000 }: PollOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    await gotoLibrary(page);
    await searchLibrary(page, title);
    const visible = await libraryRow(page, title)
      .first()
      .waitFor({ state: 'visible', timeout: FIRST_PAGE_CHECK_MS })
      .then(() => true)
      .catch(() => false);
    if (visible) return;
    if (Date.now() > deadline) {
      throw new Error(`Row "${title}" never appeared after ${timeout}ms`);
    }
    await page.waitForTimeout(interval);
  }
}

export async function viewContent(page: Page, title: string): Promise<void> {
  await waitForLibraryRow(page, title);
  await libraryRow(page, title).first().getByRole('button', { name: 'View', exact: true }).click();
  // Legacy detail URL was /content/detail/:id; v2 is /library/:kind/:id.
  await page.waitForURL(/\/library\/[^/]+\/[^/]+/, { timeout: 15000 });
}

export async function editContent(page: Page, title: string): Promise<void> {
  await waitForLibraryRow(page, title);
  await libraryRow(page, title).first().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.waitForURL(/\/library\/.+\/edit/, { timeout: 15000 });
}

/**
 * The edit form won't render while content is still processing (v2 shows
 * 'Content is being processed, try again later!' — same string as legacy).
 * The 120s budget covers the async backend processing job.
 */
export async function waitUntilContentProcessed(
  page: Page,
  title: string,
  { timeout = 120000, interval = 5000 }: PollOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    await editContent(page, title);
    await page
      .getByText('Loading…')
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => undefined);
    const stillProcessing = await page
      .getByText('Content is being processed, try again later!')
      .isVisible()
      .catch(() => false);
    if (!stillProcessing) return; // caller is left on the edit form.
    if (Date.now() > deadline) {
      throw new Error(`Content "${title}" was still processing after ${timeout}ms`);
    }
    await page.waitForTimeout(interval);
  }
}

/**
 * v2 edits happen on ContentEditScreen (/library/:kind/:id/edit), not on the
 * create form — fills 'Title (English)', saves, and returns the PATCH status.
 */
export async function updateContentTitle(page: Page, newTitle: string): Promise<number> {
  const titleInput = page.getByLabel('Title (English)', { exact: true });
  await titleInput.waitFor({ timeout: 15000 });
  await titleInput.fill(newTitle);
  const responsePromise = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && /\/content\//.test(res.url()),
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await responsePromise;
  return response.status();
}

export async function deleteEitherId(page: Page, idA: string, idB: string): Promise<void> {
  const target = (await isLibraryRowVisible(page, idA)) ? idA : idB;
  await deleteContent(page, target);
}

export async function deleteContent(page: Page, title: string): Promise<void> {
  // v2 delete uses a Mantine confirm modal, not window.confirm. Scope the
  // confirm click to the dialog and don't return until the DELETE round-trips
  // and the modal is gone — returning early lets the open dialog block the
  // next search fill.
  await waitForLibraryRow(page, title);
  const deleted = page.waitForResponse(
    (res) => res.request().method() === 'DELETE' && /\/content\//.test(res.url()),
    { timeout: 15000 },
  );
  await libraryRow(page, title).first().getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Delete content', exact: true }).click();
  await deleted;
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
}

// --- Quiz builder (/create/quiz) ---------------------------------------------

const QUIZ_OPTION_IDS = ['A', 'B', 'C', 'D'] as const;

export interface QuizQuestionValues {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctIndex?: number;
}

export interface QuizFormValues extends QuizQuestionValues {
  title: string;
  theme: string;
}

export async function gotoQuiz(page: Page): Promise<void> {
  // Legacy went through '+ Add Content' + experience picker; v2 quiz building
  // lives on its own route.
  await page.goto('/create/quiz');
  await page.getByRole('heading', { name: 'Build a quiz' }).waitFor({ timeout: 15000 });
  await page.getByLabel('Quiz name *', { exact: true }).waitFor({ timeout: 15000 });
}

/** Fills one question block (index-th in DOM order; labels repeat per block). */
export async function fillQuestion(page: Page, index: number, values: QuizQuestionValues): Promise<void> {
  await page.getByRole('textbox', { name: `Question ${index + 1}`, exact: true }).fill(values.question);
  const texts = [values.optionA, values.optionB, values.optionC, values.optionD];
  for (let i = 0; i < QUIZ_OPTION_IDS.length; i++) {
    await page
      .getByRole('textbox', { name: `Option ${QUIZ_OPTION_IDS[i]}`, exact: true })
      .nth(index)
      .fill(texts[i] ?? '');
  }
  // Mantine radios are visually hidden inputs - force the check.
  await page
    .getByRole('radio', { name: `Option ${QUIZ_OPTION_IDS[values.correctIndex ?? 0]}`, exact: true })
    .nth(index)
    .check({ force: true });
}

export async function addQuestionRow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add question' }).click();
}

/** Fills a single-question quiz in English. */
export async function fillQuizForm(page: Page, { title, theme, ...q }: QuizFormValues): Promise<void> {
  // getByLabel('Language *') strict-violates: Mantine's listbox div matches too.
  await page.locator('input[data-path="language"]').click();
  await page.getByRole('option', { name: /english/i }).click();
  await page.getByLabel('Quiz name *', { exact: true }).fill(title);
  const localTitle = page.getByLabel('Quiz name (local language) *', { exact: true });
  if (await localTitle.isVisible()) await localTitle.fill(title);
  await page.getByLabel('Theme *', { exact: true }).fill(theme);
  const localTheme = page.getByLabel('Theme (local language) *', { exact: true });
  if (await localTheme.isVisible()) await localTheme.fill(theme);
  await fillQuestion(page, 0, q);
}

// v2 quiz save shows a 'Quiz saved to Library.' notification and returns to
// /library - no native alert() dialog like legacy AddQuiz.js.
export async function saveQuiz(page: Page): Promise<{ status: number; notice: string | null }> {
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/content/quiz') && ['POST', 'PATCH'].includes(res.request().method()),
  );
  await page.getByRole('button', { name: 'Save to Library' }).click();
  const response = await responsePromise;
  const noticeLocator = page.getByText('Quiz saved to Library.');
  let notice: string | null = null;
  try {
    await noticeLocator.waitFor({ state: 'visible', timeout: 10000 });
    notice = await noticeLocator.textContent();
  } catch {
    notice = null;
  }
  return { status: response.status(), notice };
}