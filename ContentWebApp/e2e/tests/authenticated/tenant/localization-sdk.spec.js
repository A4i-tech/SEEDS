// @ts-check
const { test, expect } = require('@playwright/test');
const { uniqueId } = require('../../../fixtures/instances');
const { LocalizationPage } = require('../../../pages/LocalizationPage');

test.beforeEach(async ({}, testInfo) => {
  // Generation can run up to 5 minutes server-side (GENERATE_TIMEOUT_MS) —
  // give this spec the same headroom content.spec.js gives its async jobs.
  testInfo.setTimeout(Math.max(testInfo.timeout, 360000));
});

const SOURCE_HEADING = 'Welcome to our school';

async function injectSnippet(page, snippetTag) {
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
}

test('registered site serves extracted and translated content through the embedded SDK', async ({ page, baseURL }) => {
  const domain = `e2e-sdk-${uniqueId()}.example`;
  const loc = new LocalizationPage(page);
  const fixtureUrl = `${baseURL}/e2e-sdk-test-page.html`;

  await loc.gotoLocalizationTab();
  await loc.registerSite({ domain, name: domain, languageCodes: ['fr'] });
  const snippet = await loc.getSnippet();
  expect(snippet).toContain('data-site-id');
  expect(snippet).toContain('/sdk.js');

  const snippetTag = snippet.match(/<script[\s\S]*?<\/script>/)[0];
  const siteId = snippetTag.match(/data-site-id="([^"]+)"/)[1];

  await page.goto(fixtureUrl);
  const [extractResponse] = await Promise.all([
    page
      .waitForResponse(
        (r) =>
          r.url().endsWith('/translations/extract') &&
          r.request().method() === 'POST' &&
          r.request().postDataJSON()?.site_id === siteId,
        { timeout: 15000 }
      )
      .catch((e) => {
        throw new Error(`SDK never sent POST /translations/extract for site ${siteId}: ${e.message}`);
      }),
    injectSnippet(page, snippetTag),
  ]);
  expect(extractResponse.status()).toBe(202);

  await loc.gotoLocalizationTab();
  await loc.approveAllPendingTranslations({ siteLabel: domain, siteId, route: '/e2e-sdk-test-page.html', lang: 'fr' });
  const frenchHeading = (await page.getByLabel(`Translation for: ${SOURCE_HEADING}`).inputValue()).trim();
  expect(frenchHeading).not.toBe('');
  expect(frenchHeading).not.toBe(SOURCE_HEADING);

  await page.goto(fixtureUrl);
  await injectSnippet(page, snippetTag);

  await page.locator('#translation-sdk-widget select').selectOption('fr');

  await expect(page.locator('#e2e-sdk-heading')).toHaveText(frenchHeading, { timeout: 15000 });
});
