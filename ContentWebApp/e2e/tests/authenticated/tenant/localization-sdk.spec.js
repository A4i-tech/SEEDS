// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueId } = require('../../../fixtures/instances');
const { LocalizationPage } = require('../../../pages/LocalizationPage');

test.beforeEach(async ({}, testInfo) => {
  // Generation can run up to 5 minutes server-side (GENERATE_TIMEOUT_MS) —
  // give this spec the same headroom content.spec.js gives its async jobs.
  testInfo.setTimeout(Math.max(testInfo.timeout, 360000));
});

test('registered site serves extracted and translated content through the embedded SDK', async ({ page, baseURL }) => {
  const domain = `e2e-sdk-${uniqueId()}.example`;
  const loc = new LocalizationPage(page);

  await loc.gotoLocalizationTab();
  await loc.registerSite({ domain, name: domain, languageCodes: ['fr'] });
  const snippet = await loc.getSnippet();
  expect(snippet).toContain('data-site-id');
  expect(snippet).toContain('/sdk.js');

  const snippetTag = snippet.match(/<script[\s\S]*?<\/script>/)[0];

  await page.goto(`${baseURL}/e2e-sdk-test-page.html`);
  await page.evaluate((tag) => {
    const slot = document.getElementById('e2e-sdk-snippet-slot');
    slot.innerHTML = tag;
    const script = slot.querySelector('script');
    const live = document.createElement('script');
    for (const { name, value } of Array.from(script.attributes)) live.setAttribute(name, value);
    live.src = script.getAttribute('src');
    document.body.appendChild(live);
  }, snippetTag);

  await expect.poll(async () => {
    return page.evaluate(() => window.__translationSdkInitialized === true);
  }, { timeout: 15000 }).toBe(true);

  await loc.approveAllPendingTranslations({ route: '/e2e-sdk-test-page.html', lang: 'fr' });

  await page.reload();
  await page.evaluate(() => localStorage.setItem('translationSdk.lang', 'fr'));
  await page.reload();

  await expect(page.locator('#e2e-sdk-heading')).not.toHaveText('Welcome to our school', { timeout: 15000 });
});
