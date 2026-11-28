import path from 'node:path';
import { expect, test, type Page, type Response } from '@playwright/test';
import { PERSONAS, uniqueId } from '../../fixtures/instances';
import { login } from '../../helpers';

const SOURCE_HEADING = 'Welcome to our school';
const FIXTURE_ROUTE = '/e2e-sdk-test-page.html';
const FIXTURE_PATH = path.join(import.meta.dirname, '..', '..', 'fixtures', 'files', 'e2e-sdk-test-page.html');
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

function isScopedPost(response: Response, pathname: string, siteId: string, lang?: string): boolean {
  const url = new URL(response.url());
  return (
    response.request().method() === 'POST' &&
    url.pathname.endsWith(pathname) &&
    url.searchParams.get('site_id') === siteId &&
    (lang === undefined || url.searchParams.get('lang') === lang)
  );
}

async function injectSnippet(page: Page, snippetTag: string): Promise<void> {
  await expect(page.locator('#e2e-sdk-snippet-slot'), 'SDK fixture page has no #e2e-sdk-snippet-slot').toHaveCount(1);
  const injectionError = await page.evaluate((tag) => {
    const slot = document.getElementById('e2e-sdk-snippet-slot')!;
    slot.innerHTML = tag;
    const script = slot.querySelector('script');
    if (!script) return `snippet produced no <script> element: ${tag}`;
    const live = document.createElement('script');
    for (const { name, value } of Array.from(script.attributes)) live.setAttribute(name, value);
    live.src = script.getAttribute('src') ?? '';
    document.body.appendChild(live);
    return null;
  }, snippetTag);
  expect(injectionError, 'SDK snippet injection failed').toBeNull();
  await expect
    .poll(() => page.evaluate(() => (window as { __translationSdkInitialized?: boolean }).__translationSdkInitialized === true), {
      message: 'SDK script was injected but window.__translationSdkInitialized never became true',
      timeout: 15000,
    })
    .toBe(true);
}

test('TC-LOC-002 registered site serves extracted and approved French content through the embedded SDK', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(360000);
  const domain = `e2e-sdk-${uniqueId()}.example`;
  const fixtureUrl = `${baseURL}${FIXTURE_ROUTE}`;
  if (!LOCAL_HOSTNAMES.has(new URL(fixtureUrl).hostname)) {
    await page.route(fixtureUrl, (route) => route.fulfill({ path: FIXTURE_PATH, contentType: 'text/html' }));
  }

  await login(page, PERSONAS.tenant.identifier, PERSONAS.tenant.password);

  await page.goto('/localize/add');
  await page.getByLabel('Domain or URL').fill(domain);
  await page.locator('label').filter({ hasText: /^French$/ }).click();
  await expect(page.getByRole('checkbox', { name: 'French', exact: true })).toBeChecked();
  const [createResponse] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/websites')),
    page.getByRole('button', { name: 'Start localization (1 language)' }).click(),
  ]);
  expect(createResponse.status(), `site registration failed: ${await createResponse.text()}`).toBeLessThan(300);
  const created = (await createResponse.json()) as { site_id: string; name: string };
  const siteId = created.site_id;
  expect(created.name).not.toBe('');
  await page.waitForURL(/\/localize$/);

  await page.getByPlaceholder('Search domain…').fill(domain);
  const siteRow = page.getByRole('row').filter({ hasText: created.name });
  await siteRow.getByRole('button', { name: 'View Snippet' }).click();
  const snippetDialog = page.getByRole('dialog');
  const snippet = await snippetDialog.locator('pre').first().innerText();
  await page.keyboard.press('Escape');

  const snippetTag = snippet.match(/<script[\s\S]*?<\/script>/)?.[0];
  expect(snippetTag, `generated snippet has no <script> tag: ${snippet}`).toBeTruthy();
  const scriptSrc = snippetTag!.match(/src="([^"]+)"/)?.[1];
  expect(scriptSrc, `generated snippet has no script src: ${snippetTag}`).toBeTruthy();
  expect(new URL(scriptSrc!).pathname, `snippet src is not the SDK: ${scriptSrc}`).toBe('/sdk.js');
  expect(snippetTag).toContain(`data-site-id="${siteId}"`);

  await page.goto(fixtureUrl);
  const [extractResponse] = await Promise.all([
    page
      .waitForResponse(
        (r) =>
          new URL(r.url()).pathname.endsWith('/translations/extract') &&
          r.request().method() === 'POST' &&
          r.request().postDataJSON()?.site_id === siteId,
        { timeout: 15000 },
      )
      .catch((e: Error) => {
        throw new Error(`SDK never sent POST /translations/extract for site ${siteId}: ${e.message}`);
      }),
    injectSnippet(page, snippetTag!),
  ]);
  expect(extractResponse.status()).toBe(202);

  const [generateResponse] = await Promise.all([
    page
      .waitForResponse((r) => isScopedPost(r, '/translations/generate', siteId, 'fr'), { timeout: 300000 })
      .catch((e: Error) => {
        throw new Error(`No POST /translations/generate for site ${siteId}, lang fr: ${e.message}`);
      }),
    page.goto(`/localize/review?siteId=${encodeURIComponent(siteId)}`),
  ]);
  expect(generateResponse.status(), `generation failed: ${await generateResponse.text()}`).toBe(200);

  const translations = page.getByRole('textbox', { name: 'Translation' });
  await expect
    .poll(() => translations.evaluateAll((els) => els.length > 0 && els.every((el) => (el as HTMLTextAreaElement).value.trim() !== '')), {
      message: 'Generated French translations never appeared in the review table',
      timeout: 30000,
    })
    .toBe(true);
  const rowCount = await translations.count();

  await page.getByRole('button', { name: 'Approve all' }).click();
  const confirm = page.getByRole('dialog').getByRole('button', { name: 'Approve all' });
  const [approveResponse] = await Promise.all([
    page
      .waitForResponse((r) => isScopedPost(r, '/translations/bulk-approve', siteId), { timeout: 60000 })
      .catch((e: Error) => {
        throw new Error(`No POST /translations/bulk-approve for site ${siteId}: ${e.message}`);
      }),
    confirm.click(),
  ]);
  expect(approveResponse.status(), `bulk-approve failed: ${await approveResponse.text()}`).toBe(200);
  expect(await approveResponse.json()).toMatchObject({ approved: rowCount, skipped: 0, failed: 0 });
  await expect(page.getByRole('tab', { name: 'Pending (0)' })).toBeVisible();
  await expect(page.getByRole('tab', { name: `Approved (${rowCount})` })).toBeVisible();

  const frenchHeading = (
    await page.getByRole('row').filter({ hasText: SOURCE_HEADING }).getByRole('textbox', { name: 'Translation' }).inputValue()
  ).trim();
  expect(frenchHeading).not.toBe('');
  expect(frenchHeading).not.toBe(SOURCE_HEADING);

  await page.goto(fixtureUrl);
  await injectSnippet(page, snippetTag!);
  await page.locator('#translation-sdk-widget select').selectOption('fr');
  await expect(page.locator('#e2e-sdk-heading')).toHaveText(frenchHeading, { timeout: 15000 });
});
