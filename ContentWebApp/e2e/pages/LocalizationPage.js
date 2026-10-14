// @ts-check

class LocalizationPage {
  constructor(page) {
    this.page = page;
  }

  async gotoLocalizationTab() {
    await this.page.getByRole('tab', { name: /localization/i }).click();
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
}

module.exports = { LocalizationPage };
