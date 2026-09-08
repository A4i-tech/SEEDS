// @ts-check
const { test } = require('@playwright/test');

test('screenshot landing page', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`[${r.status()}] ${r.url()}`); });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'e2e/screenshots/smoke-landing.png', fullPage: true });

  const html = await page.content();
  const text = await page.locator('body').innerText();
  console.log('URL:', page.url());
  console.log('TITLE:', await page.title());
  console.log('BODY TEXT (600):\n', text.slice(0, 600));
  console.log('INPUT IDS:', await page.locator('input').evaluateAll(els => els.map(e => e.id || e.type)));
  console.log('ERRORS:', errors);
});
