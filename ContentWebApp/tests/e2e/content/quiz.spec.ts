import { expect, test, type Page } from '@playwright/test';
import { PERSONAS, uniqueId } from '../fixtures/instances';
import { bestEffortCleanup, loginInNewContext } from '../fixtures/session';
import {
  addQuestionRow,
  deleteContent,
  deleteEitherId,
  editContent,
  fillQuestion,
  fillQuizForm,
  gotoLibrary,
  gotoQuiz,
  isLibraryRowVisible,
  libraryRow,
  login,
  saveQuiz,
  searchLibrary,
  updateContentTitle,
  waitForLibraryRow,
} from '../helpers';

test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(Math.max(testInfo.timeout, 180000));
});
test.describe.configure({ mode: 'serial' });

interface QuizIds {
  single: string;
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
    ids: { single: '(setup)', multi: 'TC-QUIZ-012', editNoNew: 'TC-QUIZ-013', editNew: 'TC-QUIZ-014', del: 'TC-QUIZ-015' },
  },
];

for (const { roleName, personaKey, ids } of ROLES) {
  test.describe(`${roleName} quiz CRUD (unique per run, self-cleaning)`, () => {
    const singleId = uniqueId();
    const multiId = uniqueId();
    const persona = PERSONAS[personaKey] as { identifier: string; password: string };

    test(`${ids.single} ${roleName} can create a quiz with a single question`, async ({ page }) => {
      await login(page, persona.identifier, persona.password);
      await gotoLibrary(page);
      await gotoQuiz(page);
      await fillQuizForm(page, {
        title: `quiz-${singleId}`,
        theme: `theme-${singleId}`,
        question: 'What is 2+2?',
        optionA: '3',
        optionB: '4',
        optionC: '5',
        optionD: '6',
        correctIndex: 1,
      });
      const { status, notice } = await saveQuiz(page);
      expect(status).toBe(200);
      expect(notice).toMatch(/saved to library/i);
      await page.waitForURL(/\/library/, { timeout: 15000 });

      await waitForLibraryRow(page, singleId);
    });

    test(`${ids.multi} ${roleName} can create a quiz with multiple questions`, async ({ page }) => {
      await login(page, persona.identifier, persona.password);
      await gotoLibrary(page);
      await gotoQuiz(page);
      await fillQuizForm(page, {
        title: `quiz-${multiId}`,
        theme: `theme-${multiId}`,
        question: 'What is the capital of France?',
        optionA: 'Berlin',
        optionB: 'Paris',
        optionC: 'Rome',
        optionD: 'Madrid',
        correctIndex: 1,
      });
      await addQuestionRow(page);
      await fillQuestion(page, 1, {
        question: 'What is the boiling point of water (C)?',
        optionA: '90',
        optionB: '100',
        optionC: '110',
        optionD: '120',
        correctIndex: 1,
      });
      const { status, notice } = await saveQuiz(page);
      expect(status).toBe(200);
      expect(notice).toMatch(/saved to library/i);
      await page.waitForURL(/\/library/, { timeout: 15000 });

      await waitForLibraryRow(page, multiId);
    });

    test(`${ids.editNoNew} ${roleName} can edit a quiz without adding new questions`, async ({ page }) => {
      const editedTitle = `quiz-${singleId}-edited`;
      await login(page, persona.identifier, persona.password);
      await gotoLibrary(page);
      await editContent(page, singleId);
      expect(await updateContentTitle(page, editedTitle)).toBe(200);
      await expect(page.getByRole('heading', { name: editedTitle })).toBeVisible({ timeout: 15000 });
    });

    test(`${ids.editNew} ${roleName} can edit a quiz by adding new questions`, async ({ page }) => {
      const editedTitle = `quiz-${multiId}-edited`;
      await login(page, persona.identifier, persona.password);
      await gotoLibrary(page);
      await editContent(page, multiId);
      expect(await updateContentTitle(page, editedTitle)).toBe(200);
      await expect(page.getByRole('heading', { name: editedTitle })).toBeVisible({ timeout: 15000 });
    });

    test(`${ids.del} ${roleName} can delete a quiz`, async ({ page }) => {
      await login(page, persona.identifier, persona.password);
      await gotoLibrary(page);
      await deleteEitherId(page, `${singleId}-edited`, singleId);
      await deleteEitherId(page, `${multiId}-edited`, multiId);
    });

    test.afterAll(async ({ browser }) => {
      await bestEffortCleanup(browser, persona, async (page: Page) => {
        await gotoLibrary(page);
        for (const id of [`${singleId}-edited`, singleId, `${multiId}-edited`, multiId]) {
          if (await isLibraryRowVisible(page, id)) {
            await deleteContent(page, id);
          }
        }
      });
    });
  });
}

test('TC-QUIZ-011 quiz isolation for a4itestschool from school@test-a4i.local', async ({ page, browser }) => {
  const id = uniqueId();

  await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
  await gotoLibrary(page);
  await gotoQuiz(page);
  await fillQuizForm(page, {
    title: `quiz-iso-${id}`,
    theme: `theme-${id}`,
    question: 'Isolation check question?',
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctIndex: 0,
  });
  const { status } = await saveQuiz(page);
  expect(status).toBe(200);
  await page.waitForURL(/\/library/, { timeout: 15000 });
  await waitForLibraryRow(page, id);

  const { context: a4iContext, page: a4iPage } = await loginInNewContext(
    browser,
    PERSONAS.schoolA4I.identifier,
    PERSONAS.schoolA4I.password,
  );
  await gotoLibrary(a4iPage);
  await searchLibrary(a4iPage, id);
  await expect(libraryRow(a4iPage, id)).toHaveCount(0);
  await a4iContext.close();

  await deleteContent(page, id);
});

test('TC-QUIZ-016 quiz isolation for content creator from another school', async ({ page, browser }) => {
  await login(page, PERSONAS.contentCreator.identifier, PERSONAS.contentCreator.password);
  await gotoLibrary(page);

  const id = uniqueId();
  await gotoQuiz(page);
  await fillQuizForm(page, {
    title: `quiz-cc-iso-${id}`,
    theme: `theme-${id}`,
    question: 'Isolation check question?',
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctIndex: 0,
  });
  const { status } = await saveQuiz(page);
  expect(status).toBe(200);
  await page.waitForURL(/\/library/, { timeout: 15000 });
  await waitForLibraryRow(page, id);

  const { context: schoolContext, page: schoolPage } = await loginInNewContext(
    browser,
    PERSONAS.schoolA4I.identifier,
    PERSONAS.schoolA4I.password,
  );
  await gotoLibrary(schoolPage);
  await searchLibrary(schoolPage, id);
  await expect(libraryRow(schoolPage, id)).toHaveCount(0);
  await schoolContext.close();

  await deleteContent(page, id);
});
