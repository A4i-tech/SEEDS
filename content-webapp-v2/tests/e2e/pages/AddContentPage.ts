import * as path from 'path';
import type { Page } from '@playwright/test';

// Legacy asset carried over verbatim: the v2 upload screen accepts .mp3 only,
// so the same fixture still exercises the happy path.
export const TEST_AUDIO_PATH = path.join(import.meta.dirname, '..', 'fixtures', 'files', 'test-audio.mp3');
// Non-audio sibling for the .mp3-only guard test (v2 has no legacy equivalent).
export const TEST_TEXT_PATH = path.join(import.meta.dirname, '..', 'fixtures', 'files', 'test-notes.txt');

// v2 ExperienceSelect labels come from t('library.experiences.*'). story/song/
// poem resolve to Story/Song/Poem; 'snippet' has no library.experiences key so
// i18next falls back to the key itself ('library.experiences.snippet') — the
// case-insensitive regexes below match either rendering.
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

export class AddContentPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    // Legacy clicked '+ Add Content' then picked an experience; v2 splits that
    // into /create (hub) + per-kind routes, so this lands directly on the
    // audio-upload form that replaces AddStory.js.
    await this.page.goto('/create/upload');
    await this.page.getByRole('heading', { name: 'Upload audio' }).waitFor({ timeout: 15000 });
  }

  async selectExperience(label: string): Promise<void> {
    const option = EXPERIENCE_OPTIONS[label] ?? new RegExp(label, 'i');
    // getByLabel('Experience type *') strict-violates: Mantine renders a
    // div[role=listbox][aria-labelledby=input-label] that getByLabel also
    // matches. Scope to the input itself (data-path="experience").
    await this.page.locator('input[data-path="experience"]').click();
    await this.page.getByRole('option', { name: option }).click();
  }

  async selectLanguage(label: string | RegExp = /english/i): Promise<void> {
    // Same Mantine listbox double-match as selectExperience — scope to input.
    await this.page.locator('input[data-path="language"]').click();
    await this.page.getByRole('option', { name: label }).click();
  }

  /** Fills the upload form in English (so no local-language fields are required). */
  async fillStoryForm({
    title,
    theme,
    language = 'English',
    audioPath = TEST_AUDIO_PATH,
    description,
  }: StoryFormValues): Promise<void> {
    await this.selectLanguage(new RegExp(language, 'i'));
    await this.page.getByLabel('Title *', { exact: true }).fill(title);
    // Only rendered when the picked language needs local fields
    // (needsLocal() in src/features/create/utils/localized.ts) — fill when present.
    const localTitle = this.page.getByLabel('Title (local language) *', { exact: true });
    if (await localTitle.isVisible()) await localTitle.fill(title);
    await this.page.getByLabel('Theme *', { exact: true }).fill(theme);
    const localTheme = this.page.getByLabel('Theme (local language) *', { exact: true });
    if (await localTheme.isVisible()) await localTheme.fill(theme);
    if (description !== undefined) {
      await this.page.getByLabel('Description', { exact: true }).fill(description);
    }
    await this.page.locator('input[type="file"]').setInputFiles(audioPath);
  }

  // POST /content answers with a "job scheduled" message, not the finished
  // record (same async backend as legacy) — confirms acceptance; callers poll
  // the library afterward (ContentListPage.waitForRow).
  // v2 adds a confirm modal ('Save this upload?') between submit and upload.
  async save(): Promise<number> {
    const responsePromise = this.page.waitForResponse(
      (res) => /\/content(\/|$|\?)/.test(res.url()) && ['POST', 'PATCH'].includes(res.request().method()),
    );
    await this.page.getByRole('button', { name: 'Save to Library' }).click();
    const confirm = this.page.getByRole('button', { name: 'Save upload' });
    if (await confirm.isVisible()) await confirm.click();
    const response = await responsePromise;
    return response.status();
  }
}
