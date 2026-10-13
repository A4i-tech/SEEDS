import * as path from 'path';
import { expect, type Locator, type Page } from '@playwright/test';

// Mantine's password-visibility toggle also matches 'password' - target the input directly.
export async function login(page: Page, identifier: string, password: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel(/phone number or email/i).fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  // Await the /auth/login round-trip: callers navigate right after, which would abort the in-flight POST.
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

const SETTLE_MS = 250;

function pagesNav(page: Page): Locator {
  return page.locator('nav[aria-label="Pagination"]');
}

// DataTable renders an empty aria-busy table with no pager until its rows arrive, so paging before then
// would silently read "no next page" from a list that has not rendered yet.
async function waitForTableLoaded(page: Page): Promise<void> {
  await expect(page.locator('table:visible').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('table[aria-busy="true"]:visible')).toHaveCount(0, { timeout: 15000 });
}

async function gotoNextPage(page: Page): Promise<boolean> {
  await waitForTableLoaded(page);
  const next = pagesNav(page).getByRole('button', { name: 'Next', exact: true });
  if ((await next.count()) === 0 || (await next.isDisabled())) return false;
  await next.click();
  await page.waitForTimeout(SETTLE_MS);
  return true;
}

async function gotoFirstPage(page: Page, maxPages = 5): Promise<void> {
  await waitForTableLoaded(page);
  const prev = pagesNav(page).getByRole('button', { name: 'Previous', exact: true });
  for (let i = 0; i < maxPages; i++) {
    if ((await prev.count()) === 0 || (await prev.isDisabled())) return;
    await prev.click();
    await page.waitForTimeout(SETTLE_MS);
  }
}

export async function gotoRowPage(page: Page, row: Locator, maxPages = 5): Promise<boolean> {
  await gotoFirstPage(page, maxPages);
  for (let i = 0; i < maxPages; i++) {
    if (await row.count()) return true;
    if (!(await gotoNextPage(page))) return false;
  }
  return (await row.count()) > 0;
}

export async function expectRowOnAnyPage(page: Page, row: Locator, maxPages = 5): Promise<void> {
  // Retry the whole walk: a list that refetched after a mutation can briefly still hold stale rows.
  await expect
    .poll(
      async () => {
        await gotoFirstPage(page, maxPages);
        for (let i = 0; i < maxPages; i++) {
          if (await row.count()) return true;
          if (!(await gotoNextPage(page))) return false;
        }
        return false;
      },
      { timeout: 15000 },
    )
    .toBe(true);
}

export async function expectRowAbsentOnAllPages(page: Page, row: Locator, maxPages = 5): Promise<void> {
  await gotoFirstPage(page, maxPages);
  for (let i = 0; i < maxPages; i++) {
    await expect(row).toHaveCount(0);
    if (!(await gotoNextPage(page))) return;
  }
}

const TEST_AUDIO_PATH = path.join(import.meta.dirname, 'fixtures', 'files', 'test-audio.mp3');
export const TEST_TEXT_PATH = path.join(import.meta.dirname, 'fixtures', 'files', 'test-notes.txt');

const EXPERIENCE_OPTIONS: Record<string, RegExp> = {
  Story: /story/i,
  Song: /song/i,
  Poem: /poem/i,
  Snippet: /snippet/i,
};

interface StoryFormValues {
  title: string;
  theme: string;
  language?: string;
  audioPath?: string;
  description?: string;
}

export async function gotoUpload(page: Page): Promise<void> {
  await page.goto('/create/upload');
  await page.getByRole('heading', { name: 'Upload audio' }).waitFor({ timeout: 15000 });
}

export async function selectExperience(page: Page, label: string): Promise<void> {
  const option = EXPERIENCE_OPTIONS[label] ?? new RegExp(label, 'i');
  // getByLabel('Experience type *') is ambiguous with Mantine's listbox div - scope to the input.
  await page.locator('input[data-path="experience"]').click();
  await page.getByRole('option', { name: option }).click();
}

export async function selectLanguage(page: Page, label: string | RegExp = /english/i): Promise<void> {
  await page.locator('input[data-path="language"]').click();
  await page.getByRole('option', { name: label }).click();
}

export async function fillStoryForm(
  page: Page,
  { title, theme, language = 'English', audioPath = TEST_AUDIO_PATH, description }: StoryFormValues,
): Promise<void> {
  await selectLanguage(page, new RegExp(language, 'i'));
  await page.getByLabel('Title *', { exact: true }).fill(title);
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

// A stray confirm modal (ModalsProvider at app root) survives client-side nav and blocks later search fills - dismiss it.
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
  await searchLibrary(page, title);
  return libraryRow(page, title)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

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
  await page.waitForURL(/\/library\/[^/]+\/[^/]+/, { timeout: 15000 });
}

export async function editContent(page: Page, title: string): Promise<void> {
  await waitForLibraryRow(page, title);
  await libraryRow(page, title).first().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.waitForURL(/\/library\/.+\/edit/, { timeout: 15000 });
}

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
    if (!stillProcessing) return;
    if (Date.now() > deadline) {
      throw new Error(`Content "${title}" was still processing after ${timeout}ms`);
    }
    await page.waitForTimeout(interval);
  }
}

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

const QUIZ_OPTION_IDS = ['A', 'B', 'C', 'D'] as const;

interface QuizQuestionValues {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctIndex?: number;
}

interface QuizFormValues extends QuizQuestionValues {
  title: string;
  theme: string;
}

export async function gotoQuiz(page: Page): Promise<void> {
  await page.goto('/create/quiz');
  await page.getByRole('heading', { name: 'Build a quiz' }).waitFor({ timeout: 15000 });
  await page.getByLabel('Quiz name *', { exact: true }).waitFor({ timeout: 15000 });
}

export async function fillQuestion(page: Page, index: number, values: QuizQuestionValues): Promise<void> {
  await page.getByRole('textbox', { name: `Question ${index + 1}`, exact: true }).fill(values.question);
  const texts = [values.optionA, values.optionB, values.optionC, values.optionD];
  for (let i = 0; i < QUIZ_OPTION_IDS.length; i++) {
    await page
      .getByRole('textbox', { name: `Option ${QUIZ_OPTION_IDS[i]}`, exact: true })
      .nth(index)
      .fill(texts[i] ?? '');
  }
  await page
    .getByRole('radio', { name: `Option ${QUIZ_OPTION_IDS[values.correctIndex ?? 0]}`, exact: true })
    .nth(index)
    .check({ force: true });
}

export async function addQuestionRow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add question' }).click();
}

export async function fillQuizForm(page: Page, { title, theme, ...q }: QuizFormValues): Promise<void> {
  // getByLabel('Language *') is ambiguous with Mantine's listbox div - scope to the input.
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

export async function saveQuiz(page: Page): Promise<{ status: number; notice: string }> {
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/content/quiz') && ['POST', 'PATCH'].includes(res.request().method()),
  );
  await page.getByRole('button', { name: 'Save to Library' }).click();
  const response = await responsePromise;
  const noticeLocator = page.getByText('Quiz saved to Library.');
  try {
    await noticeLocator.waitFor({ state: 'visible', timeout: 10000 });
    return { status: response.status(), notice: (await noticeLocator.textContent()) ?? '' };
  } catch {
    return { status: response.status(), notice: '' };
  }
}
