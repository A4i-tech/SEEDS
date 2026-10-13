import { test as setup } from '@playwright/test';
import { PERSONAS, authFile } from '../fixtures/instances';
import { gotoLibrary, login } from '../helpers';

for (const [persona, creds] of Object.entries(PERSONAS)) {
  setup(`authenticate as ${persona}`, async ({ page }) => {
    await login(page, creds.identifier, creds.password);
    await gotoLibrary(page);

    await page.context().storageState({ path: authFile(persona) });
  });
}
