// @ts-check
const path = require('path');

const TEST_AUDIO_PATH = path.join(__dirname, '..', 'fixtures', 'files', 'test-audio.mp3');

// AddStory.js/AddQuiz.js use a custom div-based dropdown (Select.js), not a
// native <select> — trigger is a button, options are role="option" buttons in a
// listbox that only opens one at a time.
async function pickCustomOption(page, containerLocator, optionLabel) {
  await containerLocator.locator('.custom-select-trigger').click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
}

class AddContentPage {
  constructor(page) {
    this.page = page;
    this.experienceSelectTrigger = page.locator('#experience-select');
    this.languageSection = page.locator('.form-section', { hasText: 'Language' });
    this.englishThemeGroup = page.locator('.form-group', { hasText: 'English Theme' });
    this.newEnglishThemeInput = page.locator('input[placeholder="Enter new theme in English"]');
    this.englishTitleInput = page.locator('input[name="titleEnglish"]');
    this.audioFileInput = page.locator('#audioFile');
    this.ivrCheckbox = page.locator('#isPullModel');
    this.saveButton = page.getByRole('button', { name: /^Save Content$/ });
  }

  async goto() {
    await this.page.getByRole('button', { name: '+ Add Content' }).click();
    await this.experienceSelectTrigger.waitFor();
  }

  async selectExperience(label) {
    await this.experienceSelectTrigger.click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  /** Fills a Story/Poem/Song/Snippet form in English (so no local-language fields are required). */
  async fillStoryForm({ title, theme, addToIVR = false, audioPath = TEST_AUDIO_PATH }) {
    await pickCustomOption(this.page, this.languageSection, 'English');
    await pickCustomOption(this.page, this.englishThemeGroup, 'Choose New Theme');
    await this.newEnglishThemeInput.fill(theme);
    await this.englishTitleInput.fill(title);
    await this.audioFileInput.setInputFiles(audioPath);
    if (addToIVR) {
      await this.ivrCheckbox.check();
    }
  }

  // POST /content (create) and PATCH /content/:id (edit) both respond with a
  // "job scheduled" message, not the finished record — confirmed live via the
  // raw response body: {"message": "Processing New Content job scheduled!",
  // "job_id": "..."}. There's no content id available synchronously, so this
  // just confirms the request was accepted; callers must poll the list
  // afterward (ContentListPage.waitForRow) to confirm the job actually landed.
  async save() {
    const responsePromise = this.page.waitForResponse(
      (res) => /\/content(\/[^/?]+)?(\?|$)/.test(res.url()) && ['POST', 'PATCH'].includes(res.request().method())
    );
    await this.saveButton.click();
    const response = await responsePromise;
    return response.status();
  }
}

module.exports = { AddContentPage, TEST_AUDIO_PATH, pickCustomOption };
