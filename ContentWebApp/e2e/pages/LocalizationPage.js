// @ts-check
const { expect } = require('@playwright/test');

function isScopedPost(response, path, siteId, lang) {
  const url = new URL(response.url());
  return (
    response.request().method() === 'POST' &&
    url.pathname.endsWith(path) &&
    url.searchParams.get('site_id') === siteId &&
    (lang === undefined || url.searchParams.get('lang') === lang)
  );
}

class LocalizationPage {
  constructor(page) {
    this.page = page;
  }

  async gotoLocalizationTab() {
    await this.page.goto('/content');
    await this.page.getByRole('button', { name: 'Localization', exact: true }).click();
  }

  async registerSite({ domain, name, languageCodes }) {
    await this.page.getByLabel(/website url/i).fill(domain);
    if (name) {
      await this.page.getByLabel(/^name$/i).fill(name);
    }
    for (const code of languageCodes) {
      await this.page.getByLabel(code, { exact: true }).check();
    }
    await this.page.getByRole('button', { name: /register website/i }).click();
    await this.page.getByText(/website connected/i).waitFor();
  }

  async getSnippet() {
    return this.page.getByTestId('sdk-snippet').first().innerText();
  }

  async approveAllPendingTranslations({ siteLabel, siteId, route, lang }) {
    const page = this.page;
    await page.getByRole('button', { name: /translate & review/i }).click();

    const triggerFor = (label) =>
      page
        .locator('span.label', { hasText: new RegExp(`^${label}$`) })
        .locator('xpath=..')
        .locator('button.custom-select-trigger');
    const siteTrigger = triggerFor('Site');
    const pageTrigger = triggerFor('Page');
    const langTrigger = triggerFor('Review Language');

    await siteTrigger.click();
    await page.getByRole('option', { name: siteLabel, exact: true }).click();

    await pageTrigger.click();
    await page.getByRole('option', { name: route, exact: true }).click();

    await langTrigger.click();
    const langOptions = page.getByRole('option');
    const langCount = await langOptions.count();
    if (langCount !== 1) {
      throw new Error(
        `Expected exactly one language option for site registered with lang "${lang}", found ${langCount}`
      );
    }
    const [generateResponse] = await Promise.all([
      page.waitForResponse((r) => isScopedPost(r, '/translations/generate', siteId, lang), { timeout: 300000 }),
      langOptions.first().click(),
    ]).catch((e) => {
      throw new Error(`No POST /translations/generate for site ${siteId}, lang ${lang}: ${e.message}`);
    });
    if (generateResponse.status() !== 200) {
      throw new Error(
        `Generation for lang ${lang} failed with HTTP ${generateResponse.status()}: ${await generateResponse.text()}`
      );
    }

    const translations = page.locator('table.content-table tbody tr textarea');
    await expect
      .poll(() => translations.evaluateAll((els) => els.length > 0 && els.every((el) => el.value.trim() !== '')), {
        message: `Some ${lang} translations are still empty in the review table`,
        timeout: 30000,
      })
      .toBe(true);

    const rows = page.locator('table.content-table tbody tr');
    const rowCount = await rows.count();
    const [approveResponse] = await Promise.all([
      page.waitForResponse((r) => isScopedPost(r, '/translations/bulk-approve', siteId), { timeout: 60000 }),
      page.getByRole('button', { name: 'Approve all' }).click(),
    ]).catch((e) => {
      throw new Error(`No POST /translations/bulk-approve for site ${siteId}: ${e.message}`);
    });
    expect(approveResponse.status(), `bulk-approve failed: ${await approveResponse.text()}`).toBe(200);
    expect(await approveResponse.json()).toMatchObject({ approved: rowCount, skipped: 0, failed: 0 });

    await expect(rows.filter({ hasText: 'Pending Review' })).toHaveCount(0);
    await expect(rows.filter({ hasText: 'Approved' })).toHaveCount(rowCount);
  }
}

module.exports = { LocalizationPage };
