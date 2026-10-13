import { expect, test, type Page } from '@playwright/test';
import { PERSONAS, uniqueId } from '../fixtures/instances';
import { bestEffortCleanup, loginInNewContext } from '../fixtures/session';
import {
  deleteContent,
  deleteEitherId,
  fillStoryForm,
  gotoLibrary,
  gotoUpload,
  isLibraryRowVisible,
  libraryRow,
  login,
  saveUpload,
  searchLibrary,
  selectExperience,
  updateContentTitle,
  waitForLibraryRow,
  waitUntilContentProcessed,
} from '../helpers';

test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(Math.max(testInfo.timeout, 180000));
});

test.describe.configure({ mode: 'serial' });

interface CreatedEntry {
  persona: { identifier: string; password: string };
  id: string;
  updatedId?: string;
}

const EXPERIENCES = [
  { type: 'Story', prefix: 'STORY' },
  { type: 'Poem', prefix: 'POEM' },
  { type: 'Snippet', prefix: 'SNIP' },
] as const;

for (const { type, prefix } of EXPERIENCES) {
  test.describe(`${type} content`, () => {
    const created: CreatedEntry[] = [];

    test(`TC-EXP-${prefix}-001 tenant can create, update, and delete ${type} content`, async ({ page }) => {
      const id = uniqueId();
      const updatedId = uniqueId();
      created.push({ persona: PERSONAS.tenant, id, updatedId });

      await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
      await gotoLibrary(page);
      await gotoUpload(page);
      await selectExperience(page, type);
      await fillStoryForm(page, { title: `${type.toLowerCase()}-${id}`, theme: `theme-${id}` });
      expect(await saveUpload(page)).toBe(201);
      await waitForLibraryRow(page, id);

      await waitUntilContentProcessed(page, id);
      expect(await updateContentTitle(page, `${type.toLowerCase()}-${updatedId}`)).toBe(200);

      // Update propagation to the DOM isn't asserted - see content.spec.ts's
      // TC-CONT-005 note. Cleanup targets whichever id is actually showing.
      await gotoLibrary(page);
      await deleteEitherId(page, updatedId, id);
      created.pop();
    });

    test(`TC-EXP-${prefix}-002 school can create, update, and delete ${type} content`, async ({ page }) => {
      const id = uniqueId();
      const updatedId = uniqueId();
      created.push({ persona: PERSONAS.school, id, updatedId });

      await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
      await gotoLibrary(page);
      await gotoUpload(page);
      await selectExperience(page, type);
      await fillStoryForm(page, { title: `${type.toLowerCase()}-${id}`, theme: `theme-${id}` });
      expect(await saveUpload(page)).toBe(201);
      await waitForLibraryRow(page, id);

      await waitUntilContentProcessed(page, id);
      expect(await updateContentTitle(page, `${type.toLowerCase()}-${updatedId}`)).toBe(200);

      await gotoLibrary(page);
      await deleteEitherId(page, updatedId, id);
      created.pop();
    });

    test(`TC-EXP-${prefix}-003 content creator can create, update, and delete ${type} content`, async ({ page }) => {
      const id = uniqueId();
      const updatedId = uniqueId();
      created.push({ persona: PERSONAS.contentCreator, id, updatedId });

      await login(page, PERSONAS.contentCreator.identifier, PERSONAS.contentCreator.password);
      await gotoLibrary(page);
      await gotoUpload(page);
      await selectExperience(page, type);
      await fillStoryForm(page, { title: `${type.toLowerCase()}-${id}`, theme: `theme-${id}` });
      expect(await saveUpload(page)).toBe(201);
      await waitForLibraryRow(page, id);

      await waitUntilContentProcessed(page, id);
      expect(await updateContentTitle(page, `${type.toLowerCase()}-${updatedId}`)).toBe(200);

      await gotoLibrary(page);
      await deleteEitherId(page, updatedId, id);
      created.pop();
    });

    test(`TC-EXP-${prefix}-004 ${type} content isolation between schools`, async ({ page, browser }) => {
      const id = uniqueId();
      created.push({ persona: PERSONAS.school, id });

      await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
      await gotoLibrary(page);
      await gotoUpload(page);
      await selectExperience(page, type);
      await fillStoryForm(page, { title: `${type.toLowerCase()}-iso-${id}`, theme: `theme-${id}` });
      expect(await saveUpload(page)).toBe(201);
      await waitForLibraryRow(page, id);

      // Legacy logged out and back in as the other school; a fresh context
      // asserts the same property with no logout dependency.
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
      created.pop();
    });

    test.afterAll(async ({ browser }) => {
      for (const { persona, id, updatedId } of created) {
        await bestEffortCleanup(browser, persona, async (page: Page) => {
          await gotoLibrary(page);
          const target = updatedId && (await isLibraryRowVisible(page, updatedId)) ? updatedId : id;
          if (await isLibraryRowVisible(page, target)) {
            await deleteContent(page, target);
          }
        });
      }
    });
  });
}
