// @ts-check
const { test, expect } = require('@playwright/test');
const { PERSONAS, uniqueId } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ContentPage } = require('../pages/ContentPage');
const { AddContentPage } = require('../pages/AddContentPage');
const { ContentListPage } = require('../pages/ContentListPage');
const { HeaderPage } = require('../pages/HeaderPage');

// See content.spec.js's identical beforeEach for why: waitUntilProcessed()/
// waitForRow() poll for up to 90-120s by design.
test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(Math.max(testInfo.timeout, 180000));
});

// Story/Poem/Snippet all render the exact same AddStory.js form as Song (just
// a different `contentType`), so this file reuses every finding/fix already
// established in content.spec.js — see that file's header comment and
// IDEMPOTENCY.md for the full detail (async create/update jobs, pagination,
// point-in-time isVisible() pitfalls, update-propagation not being asserted).
test.describe.configure({ mode: 'serial' });

const EXPERIENCES = [
  { type: 'Story', prefix: 'STORY' },
  { type: 'Poem', prefix: 'POEM' },
  { type: 'Snippet', prefix: 'SNIP' },
];

for (const { type, prefix } of EXPERIENCES) {
  test.describe(`${type} content`, () => {
    test(`TC-EXP-${prefix}-001 tenant can create, update, and delete ${type} content`, async ({ page }) => {
      const loginPage = new LoginPage(page);
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      const updatedId = uniqueId();

      await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
      await contentPage.waitForLoad();
      await addContentPage.goto();
      await addContentPage.selectExperience(type);
      await addContentPage.fillStoryForm({ title: `${type.toLowerCase()}-${id}`, theme: `theme-${id}` });
      const createStatus = await addContentPage.save();
      expect(createStatus).toBe(201);
      await contentListPage.waitForRow(id);

      await contentListPage.waitUntilProcessed(id);
      await addContentPage.englishTitleInput.waitFor();
      await addContentPage.englishTitleInput.fill(`${type.toLowerCase()}-${updatedId}`);
      const updateStatus = await addContentPage.save();
      expect(updateStatus).toBe(200);

      // Update propagation to the DOM isn't asserted — see content.spec.js's
      // TC-CONT-005 note. Cleanup targets whichever id is actually showing.
      await contentListPage.deleteContent(id);
    });

    test(`TC-EXP-${prefix}-002 school can create, update, and delete ${type} content`, async ({ page }) => {
      const loginPage = new LoginPage(page);
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      const updatedId = uniqueId();

      await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
      await contentPage.waitForLoad();
      await addContentPage.goto();
      await addContentPage.selectExperience(type);
      await addContentPage.fillStoryForm({ title: `${type.toLowerCase()}-${id}`, theme: `theme-${id}` });
      const createStatus = await addContentPage.save();
      expect(createStatus).toBe(201);
      await contentListPage.waitForRow(id);

      await contentListPage.waitUntilProcessed(id);
      await addContentPage.englishTitleInput.waitFor();
      await addContentPage.englishTitleInput.fill(`${type.toLowerCase()}-${updatedId}`);
      const updateStatus = await addContentPage.save();
      expect(updateStatus).toBe(200);

      await contentListPage.deleteContent(id);
    });

    test(`TC-EXP-${prefix}-003 content creator can create, update, and delete ${type} content`, async ({ page }) => {
      const loginPage = new LoginPage(page);
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      const updatedId = uniqueId();

      await loginPage.login(PERSONAS.contentCreator.identifier, PERSONAS.contentCreator.password);
      await contentPage.waitForLoad();
      await addContentPage.goto();
      await addContentPage.selectExperience(type);
      await addContentPage.fillStoryForm({ title: `${type.toLowerCase()}-${id}`, theme: `theme-${id}` });
      const createStatus = await addContentPage.save();
      expect(createStatus).toBe(201);
      await contentListPage.waitForRow(id);

      await contentListPage.waitUntilProcessed(id);
      await addContentPage.englishTitleInput.waitFor();
      await addContentPage.englishTitleInput.fill(`${type.toLowerCase()}-${updatedId}`);
      const updateStatus = await addContentPage.save();
      expect(updateStatus).toBe(200);

      await contentListPage.deleteContent(id);
    });

    test(`TC-EXP-${prefix}-004 ${type} content isolation between schools`, async ({ page }) => {
      const loginPage = new LoginPage(page);
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();

      await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
      await contentPage.waitForLoad();
      await addContentPage.goto();
      await addContentPage.selectExperience(type);
      await addContentPage.fillStoryForm({ title: `${type.toLowerCase()}-iso-${id}`, theme: `theme-${id}` });
      const createStatus = await addContentPage.save();
      expect(createStatus).toBe(201);
      await contentListPage.waitForRow(id);

      await new HeaderPage(page).logout();
      await loginPage.login(PERSONAS.schoolA4I.identifier, PERSONAS.schoolA4I.password);
      await contentPage.waitForLoad();
      await expect(contentListPage.row(id)).toHaveCount(0);

      // Cleanup: delete as the school that created it.
      await new HeaderPage(page).logout();
      await loginPage.login(PERSONAS.school.identifier, PERSONAS.school.password);
      await contentPage.waitForLoad();
      await contentListPage.deleteContent(id);
    });
  });
}
