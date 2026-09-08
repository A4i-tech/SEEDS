// @ts-check
const { test: setup } = require('@playwright/test');
const { PERSONAS, authFile } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ContentPage } = require('../pages/ContentPage');

for (const [persona, creds] of Object.entries(PERSONAS)) {
  setup(`authenticate as ${persona}`, async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);

    await loginPage.login(creds.identifier, creds.password);
    await contentPage.waitForLoad();

    await page.context().storageState({ path: authFile(persona) });
  });
}
