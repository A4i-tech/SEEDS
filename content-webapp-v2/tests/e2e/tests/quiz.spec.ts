import { expect, test, type Page } from '@playwright/test';
import { PERSONAS, uniqueId } from '../fixtures/instances';
import { bestEffortCleanup, loginInNewContext } from '../fixtures/session';
import { ContentListPage } from '../pages/ContentListPage';
import { ContentPage } from '../pages/ContentPage';
import { QuizPage } from '../pages/QuizPage';
async function loginAs(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Phone number or email').fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
}

// Quiz creation goes through the same async content-processing job as
// Song/Story/etc. (POST /content/quiz responds with "job scheduled") — see
// content.spec.ts's header comment. Like legacy, quiz tests skip
// waitUntilProcessed() (no audio to process; the edit form has no gate for
// quizzes) and go straight to editContent() once the row appears.
//
// DELTA — quiz question editing has no v2 equivalent: ContentEditScreen marks
// questions read-only ('Questions are read-only here. Title, theme, and
// language can still be edited.'). The legacy edit tests (option edits, adding
// questions) are ported as title edits asserting the same PATCH 200 —
// reported, never silently dropped.
test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(Math.max(testInfo.timeout, 180000));
});
test.describe.configure({ mode: 'serial' });

interface QuizIds {
  single: string | null;
  multi: string;
  editNoNew: string;
  editNew: string;
  del: string;
}

const ROLES: Array<{ roleName: string; personaKey: 'tenant' | 'school' | 'contentCreator'; ids: QuizIds }> = [
  {
    roleName: 'tenant',
    personaKey: 'tenant',
    ids: { single: 'TC-QUIZ-001', multi: 'TC-QUIZ-002', editNoNew: 'TC-QUIZ-003', editNew: 'TC-QUIZ-004', del: 'TC-QUIZ-005' },
  },
  {
    roleName: 'school',
    personaKey: 'school',
    ids: { single: 'TC-QUIZ-006', multi: 'TC-QUIZ-007', editNoNew: 'TC-QUIZ-008', editNew: 'TC-QUIZ-009', del: 'TC-QUIZ-010' },
  },
  {
    roleName: 'content creator',
    personaKey: 'contentCreator',
    ids: { single: null, multi: 'TC-QUIZ-012', editNoNew: 'TC-QUIZ-013', editNew: 'TC-QUIZ-014', del: 'TC-QUIZ-015' },
  },
];

for (const { roleName, personaKey, ids } of ROLES) {
  test.describe(`${roleName} quiz CRUD (unique per run, self-cleaning)`, () => {
    const singleId = uniqueId();
    const multiId = uniqueId();
    const persona = PERSONAS[personaKey] as { identifier: string; password: string };

    // The doc has no dedicated "content creator can create a single-question
    // quiz" case (TC-QUIZ-012 starts at multi-question) — still create one
    // here so the edit test (TC-QUIZ-013) has a target, just without its own
    // doc-numbered assertion.
    test(`${ids.single ?? '(setup)'} ${roleName} can create a quiz with a single question`, async ({ page }) => {
      const contentPage = new ContentPage(page);
      const quizPage = new QuizPage(page);
      const contentListPage = new ContentListPage(page);

      await loginAs(page, persona.identifier, persona.password);
      await contentPage.waitForLoad();
      await quizPage.goto();
      await quizPage.selectExperience();
      await quizPage.fillQuizForm({
        title: `quiz-${singleId}`,
        theme: `theme-${singleId}`,
        question: 'What is 2+2?',
        optionA: '3',
        optionB: '4',
        optionC: '5',
        optionD: '6',
        correctIndex: 1,
      });
      const { status, notice } = await quizPage.save();
      expect(status).toBe(200);
      // Legacy asserted the alert text /saved successfully/i; v2 shows a
      // 'Quiz saved to Library.' notification instead.
      expect(notice).toMatch(/saved to library/i);
      await page.waitForURL(/\/library/, { timeout: 15000 });

      await contentListPage.waitForRow(singleId);
    });

    test(`${ids.multi} ${roleName} can create a quiz with multiple questions`, async ({ page }) => {
      const contentPage = new ContentPage(page);
      const quizPage = new QuizPage(page);
      const contentListPage = new ContentListPage(page);

      await loginAs(page, persona.identifier, persona.password);
      await contentPage.waitForLoad();
      await quizPage.goto();
      await quizPage.selectExperience();
      await quizPage.fillQuizForm({
        title: `quiz-${multiId}`,
        theme: `theme-${multiId}`,
        question: 'What is the capital of France?',
        optionA: 'Berlin',
        optionB: 'Paris',
        optionC: 'Rome',
        optionD: 'Madrid',
        correctIndex: 1,
      });
      await quizPage.addQuestionRow();
      await quizPage.fillQuestion(1, {
        question: 'What is the boiling point of water (C)?',
        optionA: '90',
        optionB: '100',
        optionC: '110',
        optionD: '120',
        correctIndex: 1,
      });
      const { status, notice } = await quizPage.save();
      expect(status).toBe(200);
      expect(notice).toMatch(/saved to library/i);
      await page.waitForURL(/\/library/, { timeout: 15000 });

      await contentListPage.waitForRow(multiId);
    });

    test(`${ids.editNoNew} ${roleName} can edit a quiz without adding new questions`, async ({ page }) => {
      // DELTA: question text is read-only in v2 — edits the title instead
      // (same PATCH endpoint, same 200 contract).
      const contentPage = new ContentPage(page);
      const contentListPage = new ContentListPage(page);
      const editedTitle = `quiz-${singleId}-edited`;

      await loginAs(page, persona.identifier, persona.password);
      await contentPage.waitForLoad();
      await contentListPage.editContent(singleId);
      const status = await contentListPage.updateTitleOnEditForm(editedTitle);
      expect(status).toBe(200);
      await expect(page.getByRole('heading', { name: editedTitle })).toBeVisible({ timeout: 15000 });
    });

    test(`${ids.editNew} ${roleName} can edit a quiz by adding new questions`, async ({ page }) => {
      // DELTA: adding questions is impossible in v2 (see header) — edits the
      // title instead (same PATCH endpoint, same 200 contract).
      const contentPage = new ContentPage(page);
      const contentListPage = new ContentListPage(page);
      const editedTitle = `quiz-${multiId}-edited`;

      await loginAs(page, persona.identifier, persona.password);
      await contentPage.waitForLoad();
      await contentListPage.editContent(multiId);
      const status = await contentListPage.updateTitleOnEditForm(editedTitle);
      expect(status).toBe(200);
      await expect(page.getByRole('heading', { name: editedTitle })).toBeVisible({ timeout: 15000 });
    });

    test(`${ids.del} ${roleName} can delete a quiz`, async ({ page }) => {
      const contentPage = new ContentPage(page);
      const contentListPage = new ContentListPage(page);

      await loginAs(page, persona.identifier, persona.password);
      await contentPage.waitForLoad();
      await contentListPage.deleteEitherId(`${singleId}-edited`, singleId);
      await contentListPage.deleteEitherId(`${multiId}-edited`, multiId);
    });

    test.afterAll(async ({ browser }) => {
      await bestEffortCleanup(browser, persona, async (page: Page) => {
        const contentPage = new ContentPage(page);
        const contentListPage = new ContentListPage(page);
        await contentPage.waitForLoad();
        for (const id of [`${singleId}-edited`, singleId, `${multiId}-edited`, multiId]) {
          if (await contentListPage.isRowVisible(id)) {
            await contentListPage.deleteContent(id);
          }
        }
      });
    });
  });
}

test('TC-QUIZ-011 quiz isolation for a4itestschool from school@test-a4i.local', async ({ page, browser }) => {
  const contentPage = new ContentPage(page);
  const quizPage = new QuizPage(page);
  const contentListPage = new ContentListPage(page);
  const id = uniqueId();

  await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
  await contentPage.waitForLoad();
  await quizPage.goto();
  await quizPage.selectExperience();
  await quizPage.fillQuizForm({
    title: `quiz-iso-${id}`,
    theme: `theme-${id}`,
    question: 'Isolation check question?',
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctIndex: 0,
  });
  const { status } = await quizPage.save();
  expect(status).toBe(200);
  await page.waitForURL(/\/library/, { timeout: 15000 });
  await contentListPage.waitForRow(id);

  const { context: a4iContext, page: a4iPage } = await loginInNewContext(
    browser,
    PERSONAS.schoolA4I.identifier,
    PERSONAS.schoolA4I.password,
  );
  const a4iContentPage = new ContentPage(a4iPage);
  const a4iContentListPage = new ContentListPage(a4iPage);
  await a4iContentPage.waitForLoad();
  await a4iContentListPage.searchInput.fill(id);
  await expect(a4iContentListPage.row(id)).toHaveCount(0);
  await a4iContext.close();

  await contentListPage.deleteContent(id);
});

test('TC-QUIZ-016 quiz isolation for content creator from school@test-a4i.local', async ({ page, browser }) => {
  const contentPage = new ContentPage(page);
  const contentListPage = new ContentListPage(page);

  await loginAs(page, PERSONAS.contentCreator.identifier, PERSONAS.contentCreator.password);
  await contentPage.waitForLoad();

  const id = uniqueId();
  const quizPage = new QuizPage(page);
  await quizPage.goto();
  await quizPage.selectExperience();
  await quizPage.fillQuizForm({
    title: `quiz-cc-iso-${id}`,
    theme: `theme-${id}`,
    question: 'Isolation check question?',
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctIndex: 0,
  });
  const { status } = await quizPage.save();
  expect(status).toBe(200);
  await page.waitForURL(/\/library/, { timeout: 15000 });
  await contentListPage.waitForRow(id);

  const { context: schoolContext, page: schoolPage } = await loginInNewContext(
    browser,
    PERSONAS.school.identifier,
    PERSONAS.school.password,
  );
  const schoolContentPage = new ContentPage(schoolPage);
  const schoolContentListPage = new ContentListPage(schoolPage);
  await schoolContentPage.waitForLoad();
  await schoolContentListPage.searchInput.fill(id);
  await expect(schoolContentListPage.row(id)).toHaveCount(0);
  await schoolContext.close();

  await contentListPage.deleteContent(id);
});
