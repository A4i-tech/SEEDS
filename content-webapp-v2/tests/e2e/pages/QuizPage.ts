import type { Locator, Page } from '@playwright/test';

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

const OPTION_IDS = ['A', 'B', 'C', 'D'] as const;

export class QuizPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get titleInput() {
    return this.page.getByLabel('Quiz name *', { exact: true });
  }

  get themeInput() {
    return this.page.getByLabel('Theme *', { exact: true });
  }

  get addQuestionButton() {
    return this.page.getByRole('button', { name: 'Add question' });
  }

  get saveButton() {
    return this.page.getByRole('button', { name: 'Save to Library' });
  }

  async goto(): Promise<void> {
    // Legacy went through '+ Add Content' + experience picker; v2 quiz
    // building lives on its own route.
    await this.page.goto('/create/quiz');
    await this.page.getByRole('heading', { name: 'Build a quiz' }).waitFor({ timeout: 15000 });
  }

  /**
   * v2 has no experience picker on the quiz route (type is fixed to 'quiz') —
   * ensures the blank-question form is showing instead. The builder defaults
   * to the 'Blank quiz' starter, so this is a presence check, not a selection.
   */
  async selectExperience(): Promise<void> {
    await this.titleInput.waitFor({ timeout: 15000 });
  }

  async setEnglish(): Promise<void> {
    // getByLabel('Language *') strict-violates: Mantine's
    // div[role=listbox][aria-labelledby] matches the label too. Scope to input.
    await this.page.locator('input[data-path="language"]').click();
    await this.page.getByRole('option', { name: /english/i }).click();
  }

  question(index: number): {
    questionInput: Locator;
    options: Locator[];
    correctRadio: (optionIdx: number) => Locator;
  } {
    // Every question block reuses the same aria-labels ('Question N' is
    // per-block via t('create.questionN'); options repeat 'Option A'-'D'),
    // so nth(index) scopes to the index-th question in DOM order.
    return {
      questionInput: this.page.getByRole('textbox', { name: `Question ${index + 1}`, exact: true }),
      options: OPTION_IDS.map((id) =>
        this.page.getByRole('textbox', { name: `Option ${id}`, exact: true }).nth(index),
      ),
      correctRadio: (optionIdx: number) =>
        this.page
          .getByRole('radio', { name: `Option ${OPTION_IDS[optionIdx] ?? 'A'}`, exact: true })
          .nth(index),
    };
  }

  async fillQuestion(index: number, values: QuizQuestionValues): Promise<void> {
    const q = this.question(index);
    await q.questionInput.fill(values.question);
    const texts = [values.optionA, values.optionB, values.optionC, values.optionD];
    for (let i = 0; i < q.options.length; i++) {
      await (q.options[i] as Locator).fill(texts[i] ?? '');
    }
    // Mantine radios are visually hidden inputs — force the check.
    await q.correctRadio(values.correctIndex ?? 0).check({ force: true });
  }

  async addQuestionRow(): Promise<void> {
    await this.addQuestionButton.click();
  }

  /** Fills a single-question quiz in English. */
  async fillQuizForm({ title, theme, ...q }: QuizFormValues): Promise<void> {
    await this.setEnglish();
    await this.titleInput.fill(title);
    const localTitle = this.page.getByLabel('Quiz name (local language) *', { exact: true });
    if (await localTitle.isVisible()) await localTitle.fill(title);
    await this.themeInput.fill(theme);
    const localTheme = this.page.getByLabel('Theme (local language) *', { exact: true });
    if (await localTheme.isVisible()) await localTheme.fill(theme);
    await this.fillQuestion(0, q);
  }

  // v2 quiz save shows a 'Quiz saved to Library.' notification and navigates
  // to /library — no native alert() dialog like legacy AddQuiz.js.
  async save(): Promise<{ status: number; notice: string | null }> {
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes('/content/quiz') && ['POST', 'PATCH'].includes(res.request().method()),
    );
    await this.saveButton.click();
    const response = await responsePromise;
    const noticeLocator = this.page.getByText('Quiz saved to Library.');
    let notice: string | null = null;
    try {
      await noticeLocator.waitFor({ state: 'visible', timeout: 10000 });
      notice = await noticeLocator.textContent();
    } catch {
      notice = null;
    }
    return { status: response.status(), notice };
  }
}
