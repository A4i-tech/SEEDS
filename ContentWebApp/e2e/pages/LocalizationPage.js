// @ts-check

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
    return this.page.locator('[data-testid="sdk-snippet"], pre, code').first().innerText();
  }

  async approveAllPendingTranslations({ siteLabel, route, lang }) {
    const page = this.page;
    await page.getByRole('button', { name: /translate & review/i }).click();

    const triggers = page.locator('button.custom-select-trigger');
    const siteTrigger = triggers.nth(0);
    const pageTrigger = triggers.nth(1);
    const langTrigger = triggers.nth(2);

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
    await langOptions.first().click();

    // Generation runs server-side after scope selection and can take up to
    // GENERATE_TIMEOUT_MS (5 minutes); wait for a real segment row before
    // approving so "Approve all" has something to approve.
    await page.locator('table.content-table tbody tr').first().waitFor({ timeout: 300000 });

    await page.getByRole('button', { name: 'Approve all' }).click();
  }
}

module.exports = { LocalizationPage };
