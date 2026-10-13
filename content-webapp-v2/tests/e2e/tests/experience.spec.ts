import { expect, test, type Page } from '@playwright/test';
import { PERSONAS, uniqueId } from '../fixtures/instances';
import { bestEffortCleanup, loginInNewContext } from '../fixtures/session';
import { AddContentPage } from '../pages/AddContentPage';
import { ContentListPage } from '../pages/ContentListPage';
import { ContentPage } from '../pages/ContentPage';
async function loginAs(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Phone number or email').fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
}

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
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      const updatedId = uniqueId();
      created.push({ persona: PERSONAS.tenant, id, updatedId });

      await loginAs(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);
      await contentPage.waitForLoad();
      await addContentPage.goto();
      await addContentPage.selectExperience(type);
      await addContentPage.fillStoryForm({ title: `${type.toLowerCase()}-${id}`, theme: `theme-${id}` });
      const createStatus = await addContentPage.save();
      expect(createStatus).toBe(201);
      await contentListPage.waitForRow(id);

      await contentListPage.waitUntilProcessed(id);
      const updateStatus = await contentListPage.updateTitleOnEditForm(`${type.toLowerCase()}-${updatedId}`);
      expect(updateStatus).toBe(200);

      // Update propagation to the DOM isn't asserted — see content.spec.ts's
      // TC-CONT-005 note. Cleanup targets whichever id is actually showing.
      // updateTitleOnEditForm leaves the page on the edit/detail route;
      // deleteEitherId->isRowVisible needs the /library search box (POM-owned).
      await contentListPage.goto();
      await contentListPage.deleteEitherId(updatedId, id);
      created.pop();
    });

    test(`TC-EXP-${prefix}-002 school can create, update, and delete ${type} content`, async ({ page }) => {
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      const updatedId = uniqueId();
      created.push({ persona: PERSONAS.school, id, updatedId });

      await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
      await contentPage.waitForLoad();
      await addContentPage.goto();
      await addContentPage.selectExperience(type);
      await addContentPage.fillStoryForm({ title: `${type.toLowerCase()}-${id}`, theme: `theme-${id}` });
      const createStatus = await addContentPage.save();
      expect(createStatus).toBe(201);
      await contentListPage.waitForRow(id);

      await contentListPage.waitUntilProcessed(id);
      const updateStatus = await contentListPage.updateTitleOnEditForm(`${type.toLowerCase()}-${updatedId}`);
      expect(updateStatus).toBe(200);

      // Same edit-form -> /library return as -001 (POM-owned navigation gap).
      await contentListPage.goto();
      await contentListPage.deleteEitherId(updatedId, id);
      created.pop();
    });

    test(`TC-EXP-${prefix}-003 content creator can create, update, and delete ${type} content`, async ({ page }) => {
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      const updatedId = uniqueId();
      created.push({ persona: PERSONAS.contentCreator, id, updatedId });

      await loginAs(page, PERSONAS.contentCreator.identifier, PERSONAS.contentCreator.password);
      await contentPage.waitForLoad();
      await addContentPage.goto();
      await addContentPage.selectExperience(type);
      await addContentPage.fillStoryForm({ title: `${type.toLowerCase()}-${id}`, theme: `theme-${id}` });
      const createStatus = await addContentPage.save();
      expect(createStatus).toBe(201);
      await contentListPage.waitForRow(id);

      await contentListPage.waitUntilProcessed(id);
      const updateStatus = await contentListPage.updateTitleOnEditForm(`${type.toLowerCase()}-${updatedId}`);
      expect(updateStatus).toBe(200);

      // Same edit-form -> /library return as -001 (POM-owned navigation gap).
      await contentListPage.goto();
      await contentListPage.deleteEitherId(updatedId, id);
      created.pop();
    });

    test(`TC-EXP-${prefix}-004 ${type} content isolation between schools`, async ({ page, browser }) => {
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      created.push({ persona: PERSONAS.school, id });

      await loginAs(page, PERSONAS.school.identifier, PERSONAS.school.password);
      await contentPage.waitForLoad();
      await addContentPage.goto();
      await addContentPage.selectExperience(type);
      await addContentPage.fillStoryForm({ title: `${type.toLowerCase()}-iso-${id}`, theme: `theme-${id}` });
      const createStatus = await addContentPage.save();
      expect(createStatus).toBe(201);
      await contentListPage.waitForRow(id);

      // Legacy logged out and back in as the other school; a fresh context
      // asserts the same property with no logout dependency.
      const { context: a4iContext, page: a4iPage } = await loginInNewContext(
        browser,
        PERSONAS.schoolA4I.identifier,
        PERSONAS.schoolA4I.password,
      );
      const a4iContentListPage = new ContentListPage(a4iPage);
      await new ContentPage(a4iPage).waitForLoad();
      await a4iContentListPage.searchInput.fill(id);
      await expect(a4iContentListPage.row(id)).toHaveCount(0);
      await a4iContext.close();

      await contentListPage.deleteContent(id);
      created.pop();
    });

    test.afterAll(async ({ browser }) => {
      for (const { persona, id, updatedId } of created) {
        await bestEffortCleanup(browser, persona, async (page: Page) => {
          const contentPage = new ContentPage(page);
          const contentListPage = new ContentListPage(page);
          await contentPage.waitForLoad();
          const target = updatedId && (await contentListPage.isRowVisible(updatedId)) ? updatedId : id;
          if (await contentListPage.isRowVisible(target)) {
            await contentListPage.deleteContent(target);
          }
        });
      }
    });
  });
}
