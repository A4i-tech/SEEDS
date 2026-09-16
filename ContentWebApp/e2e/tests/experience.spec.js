// @ts-check
const { test, expect } = require('@playwright/test');
const { PERSONAS, uniqueId } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ContentPage } = require('../pages/ContentPage');
const { AddContentPage } = require('../pages/AddContentPage');
const { ContentListPage } = require('../pages/ContentListPage');
const { HeaderPage } = require('../pages/HeaderPage');
const { bestEffortCleanup } = require('../fixtures/session');

// See content.spec.js's identical beforeEach for why: waitUntilProcessed()/
// waitForRow() poll for up to 90-120s by design.
test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(Math.max(testInfo.timeout, 180000));
});

// Story/Poem/Snippet reuse Song's AddStory.js form and content.spec.js's
// fixes — see the Docmost test-cases page for full idempotency detail:
// https://docmost.a4i-lab.in/s/seeds/p/seeds-test-cases-54bIGOBUUJ
test.describe.configure({ mode: 'serial' });

const EXPERIENCES = [
  { type: 'Story', prefix: 'STORY' },
  { type: 'Poem', prefix: 'POEM' },
  { type: 'Snippet', prefix: 'SNIP' },
];

for (const { type, prefix } of EXPERIENCES) {
  test.describe(`${type} content`, () => {
    // Tracks {persona, id, updatedId} per test as it creates content, so
    // afterAll can best-effort delete anything a mid-test assertion failure
    // left behind — the inline deleteEitherId()/deleteContent() calls above
    // only run on the happy path.
    const created = [];

    test(`TC-EXP-${prefix}-001 tenant can create, update, and delete ${type} content`, async ({ page }) => {
      const loginPage = new LoginPage(page);
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      const updatedId = uniqueId();
      created.push({ persona: PERSONAS.tenant, id, updatedId });

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
      await contentListPage.deleteEitherId(updatedId, id);
      created.pop();
    });

    test(`TC-EXP-${prefix}-002 school can create, update, and delete ${type} content`, async ({ page }) => {
      const loginPage = new LoginPage(page);
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      const updatedId = uniqueId();
      created.push({ persona: PERSONAS.school, id, updatedId });

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

      await contentListPage.deleteEitherId(updatedId, id);
      created.pop();
    });

    test(`TC-EXP-${prefix}-003 content creator can create, update, and delete ${type} content`, async ({ page }) => {
      const loginPage = new LoginPage(page);
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      const updatedId = uniqueId();
      created.push({ persona: PERSONAS.contentCreator, id, updatedId });

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

      await contentListPage.deleteEitherId(updatedId, id);
      created.pop();
    });

    test(`TC-EXP-${prefix}-004 ${type} content isolation between schools`, async ({ page }) => {
      const loginPage = new LoginPage(page);
      const contentPage = new ContentPage(page);
      const addContentPage = new AddContentPage(page);
      const contentListPage = new ContentListPage(page);
      const id = uniqueId();
      created.push({ persona: PERSONAS.school, id });

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
      created.pop();
    });

    test.afterAll(async ({ browser }) => {
      for (const { persona, id, updatedId } of created) {
        await bestEffortCleanup(browser, persona, async (page) => {
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
