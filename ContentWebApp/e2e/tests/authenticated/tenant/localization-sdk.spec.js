// @ts-check
const path = require('path');
const { test, expect } = require('@playwright/test');
const { uniqueId } = require('../../../fixtures/instances');
const { LocalizationPage } = require('../../../pages/LocalizationPage');

test.beforeEach(async ({}, testInfo) => {
  // Generation can run up to 5 minutes server-side (GENERATE_TIMEOUT_MS) —
  // give this spec the same headroom content.spec.js gives its async jobs.
  testInfo.setTimeout(Math.max(testInfo.timeout, 360000));
});

const SOURCE_HEADING = 'Welcome to our school';
const FIXTURE_ROUTE = '/e2e-sdk-test-page.html';
const FIXTURE_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'fixtures',
  'files',
  'e2e-sdk-test-page.html'
);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

async function injectSnippet(page, snippetTag) {
  await expect(page.locator('#e2e-sdk-snippet-slot'), 'SDK fixture page has no #e2e-sdk-snippet-slot').toHaveCount(1);
  const injectionError = await page.evaluate((tag) => {
    const slot = document.getElementById('e2e-sdk-snippet-slot');
    slot.innerHTML = tag;
    const script = slot.querySelector('script');
    if (!script) return `snippet produced no <script> element: ${tag}`;
    const live = document.createElement('script');
    for (const { name, value } of Array.from(script.attributes)) live.setAttribute(name, value);
    live.src = script.getAttribute('src');
    document.body.appendChild(live);
    return null;
  }, snippetTag);
  expect(injectionError, 'SDK snippet injection failed').toBeNull();

  await expect.poll(async () => {
    return page.evaluate(() => window.__translationSdkInitialized === true);
  }, { message: 'SDK script was injected but window.__translationSdkInitialized never became true', timeout: 15000 }).toBe(true);
}

test('registered site serves extracted and translated content through the embedded SDK', async ({ page, baseURL }) => {
  const domain = `e2e-sdk-${uniqueId()}.example`;
  const loc = new LocalizationPage(page);
  const fixtureUrl = `${baseURL}${FIXTURE_ROUTE}`;
  if (!LOCAL_HOSTNAMES.has(new URL(fixtureUrl).hostname)) {
    await page.route(fixtureUrl, (route) =>
      route.fulfill({ path: FIXTURE_PATH, contentType: 'text/html' })
    );
  }

  await loc.gotoLocalizationTab();
  await loc.registerSite({ domain, name: domain, languageCodes: ['fr'] });
  const snippet = await loc.getSnippet();
  const snippetTag = snippet.match(/<script[\s\S]*?<\/script>/)?.[0];
  expect(snippetTag, `generated snippet has no <script> tag: ${snippet}`).toBeTruthy();
  const scriptSrc = snippetTag.match(/src="([^"]+)"/)?.[1];
  expect(scriptSrc, `generated snippet has no script src: ${snippetTag}`).toBeTruthy();
  expect(new URL(scriptSrc).pathname, `snippet src is not the SDK: ${scriptSrc}`).toBe('/sdk.js');
  const siteId = snippetTag.match(/data-site-id="([^"]+)"/)?.[1];
  expect(siteId, `generated snippet has no data-site-id: ${snippetTag}`).toBeTruthy();

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
  await loc.approveAllPendingTranslations({ siteLabel: domain, siteId, route: FIXTURE_ROUTE, lang: 'fr' });
  const frenchHeading = (await page.getByLabel(`Translation for: ${SOURCE_HEADING}`).inputValue()).trim();
  expect(frenchHeading).not.toBe('');
  expect(frenchHeading).not.toBe(SOURCE_HEADING);

  await page.goto(fixtureUrl);
  await injectSnippet(page, snippetTag);

  await page.locator('#translation-sdk-widget select').selectOption('fr');

  await expect(page.locator('#e2e-sdk-heading')).toHaveText(frenchHeading, { timeout: 15000 });
});
