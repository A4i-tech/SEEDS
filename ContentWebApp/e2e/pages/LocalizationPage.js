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

  // Signature fixed by the ticket to { route, lang }, so the site itself isn't
  // identified by name here — the shared tenant persona's site list accumulates
  // across every E2E run, so instead of trusting a derived/guessed label we try
  // each registered site in turn and keep the first one whose page picker
  // actually offers `route` (only the site this spec just registered will).
  async approveAllPendingTranslations({ route, lang }) {
    const page = this.page;
    await page.getByRole('button', { name: /translate & review/i }).click();

    const triggers = page.locator('button.custom-select-trigger');
    const siteTrigger = triggers.nth(0);
    const pageTrigger = triggers.nth(1);
    const langTrigger = triggers.nth(2);

    await siteTrigger.click();
    const siteLabels = await page.getByRole('option').allTextContents();
    await page.keyboard.press('Escape');

    let matched = false;
    for (const siteLabel of siteLabels) {
      await siteTrigger.click();
      await page.getByRole('option', { name: siteLabel, exact: true }).click();

      await pageTrigger.click();
      const routeOption = page.getByRole('option', { name: route, exact: true });
      const hasRoute = await routeOption
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (hasRoute) {
        await routeOption.click();
        matched = true;
        break;
      }
      await page.keyboard.press('Escape');
    }
    if (!matched) {
      throw new Error(`No registered site exposes page route "${route}" for review`);
    }

    // The language option's visible label is a display name (e.g. "French"),
    // not the raw code, and isn't available anywhere in this page's own markup
    // to match against safely. Since the site was registered with exactly one
    // enabled language, the picker has exactly one option here — fail loud
    // instead of guessing a label if that ever stops being true.
    await langTrigger.click();
    const langOptions = page.getByRole('option');
    const langCount = await langOptions.count();
    if (langCount !== 1) {
      throw new Error(
        `Expected exactly one language option for site registered with lang "${lang}", found ${langCount}`
      );
    }
    await langOptions.first().click();

    await page.getByRole('button', { name: 'Approve all' }).click();
  }
}

module.exports = { LocalizationPage };
