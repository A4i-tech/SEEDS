// @ts-check
const { pickCustomOption } = require('./AddContentPage');

class QuizPage {
  constructor(page) {
    this.page = page;
    this.experienceSelectTrigger = page.locator('#experience-select');
    // AddQuiz.js's language Select has no id/wrapper class to scope by — its
    // trigger is the only one on the page showing the default "Kannada" label
    // (or, on the edit form, whatever language the quiz already has).
    this.languageTrigger = page.locator('.custom-select-trigger', { hasText: 'Kannada' });
    this.titleInput = page.locator('input[name="title"]');
    this.themeInput = page.locator('input[name="theme"]');
    this.addQuestionButton = page.getByRole('button', { name: '+ Question' });
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
  }

  async goto() {
    await this.page.getByRole('button', { name: '+ Add Content' }).click();
    await this.experienceSelectTrigger.waitFor();
  }

  async selectExperience() {
    await this.experienceSelectTrigger.click();
    await this.page.getByRole('option', { name: 'Quiz', exact: true }).click();
  }

  async setEnglish() {
    // Default language is "kn" (Kannada) — switch to English so no
    // local-language title/theme fields are required (same reasoning as
    // AddContentPage.fillStoryForm).
    await this.languageTrigger.click();
    await this.page.getByRole('option', { name: 'English', exact: true }).click();
  }

  question(index) {
    return {
      questionInput: this.page.locator('input[name="question"]').nth(index),
      optionA: this.page.locator('input[name="optionA"]').nth(index),
      optionB: this.page.locator('input[name="optionB"]').nth(index),
      optionC: this.page.locator('input[name="optionC"]').nth(index),
      optionD: this.page.locator('input[name="optionD"]').nth(index),
      // correctAnswer-{index} radios are named per question row, index 0-3 for A-D.
      correctRadio: (optionIdx) => this.page.locator(`input[name="correctAnswer-${index}"]`).nth(optionIdx),
    };
  }

  async fillQuestion(index, { question, optionA, optionB, optionC, optionD, correctIndex = 0 }) {
    const q = this.question(index);
    await q.questionInput.fill(question);
    await q.optionA.fill(optionA);
    await q.optionB.fill(optionB);
    await q.optionC.fill(optionC);
    await q.optionD.fill(optionD);
    await q.correctRadio(correctIndex).check();
  }

  async addQuestionRow() {
    await this.addQuestionButton.click();
  }

  /** Fills a single-question quiz in English. */
  async fillQuizForm({ title, theme, question, optionA, optionB, optionC, optionD, correctIndex = 0 }) {
    await this.setEnglish();
    await this.titleInput.fill(title);
    await this.themeInput.fill(theme);
    await this.fillQuestion(0, { question, optionA, optionB, optionC, optionD, correctIndex });
  }

  // AddQuiz.js uses native alert()/confirm() for save feedback, not a flash
  // message — Playwright auto-dismisses dialogs unless handled, so this arms
  // a handler before clicking Save and returns the alert's text plus the
  // create/update response status.
  async save() {
    const responsePromise = this.page.waitForResponse(
      (res) => /\/content\/quiz|\/content\/[^/?]+\?/.test(res.url()) && ['POST', 'PATCH'].includes(res.request().method())
    );
    const dialogPromise = new Promise((resolve) => this.page.once('dialog', (dialog) => {
      const message = dialog.message();
      dialog.accept();
      resolve(message);
    }));
    await this.saveButton.click();
    const [response, alertMessage] = await Promise.all([responsePromise, dialogPromise]);
    return { status: response.status(), alertMessage };
  }
}

module.exports = { QuizPage };
