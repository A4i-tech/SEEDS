import { test as setup } from '@playwright/test';
import { PERSONAS, authFile } from '../fixtures/instances';
import { LoginPage } from '../pages/LoginPage';
import { ContentPage } from '../pages/ContentPage';

for (const [persona, creds] of Object.entries(PERSONAS)) {
  setup(`authenticate as ${persona}`, async ({ page }) => {
    const loginPage = new LoginPage(page);
    const contentPage = new ContentPage(page);

    await loginPage.login(creds.identifier, creds.password);
    await contentPage.waitForLoad();

    await page.context().storageState({ path: authFile(persona) });
  });
}
