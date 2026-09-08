// @ts-check
const { test, expect } = require('@playwright/test');

const TENANT_EMAIL = 'test@gmail.com';
const TENANT_PASS = 'Test@123';
const SCHOOL_ADMIN_EMAIL = 'school@test-a4i.local';
const SCHOOL_ADMIN_PASS = 'Test@123';

// Collect all console errors and failed requests per test
function attachListeners(page, log) {
  page.on('console', msg => {
    if (msg.type() === 'error') log.push(`[console.error] ${msg.text()}`);
    if (msg.type() === 'warning') log.push(`[console.warn] ${msg.text()}`);
  });
  page.on('pageerror', err => log.push(`[pageerror] ${err.message}`));
  page.on('response', res => {
    if (res.status() >= 400) log.push(`[http ${res.status()}] ${res.url()}`);
  });
}

async function loginAs(page, identifier, password) {
  await page.goto('/');
  await page.waitForSelector('#login-identifier');
  await page.fill('#login-identifier', identifier);
  await page.fill('#login-password', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

// ─── Tenant login ────────────────────────────────────────────────────────────

test('tenant login succeeds and lands on /content', async ({ page }) => {
  const log = [];
  attachListeners(page, log);

  await loginAs(page, TENANT_EMAIL, TENANT_PASS);
  await page.screenshot({ path: 'e2e/screenshots/01-tenant-post-login.png' });

  console.log('URL:', page.url());
  console.log('ERRORS:', log);
  expect(page.url()).toContain('/content');
  expect(log.filter(l => l.includes('[http 4') || l.includes('[http 5'))).toHaveLength(0);
});

test('tenant content page — capture all API calls', async ({ page }) => {
  const requests = [];
  page.on('response', res => requests.push({ url: res.url(), status: res.status() }));

  await loginAs(page, TENANT_EMAIL, TENANT_PASS);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'e2e/screenshots/02-tenant-content.png' });

  const api = requests.filter(r => r.url.includes('onrender.com'));
  console.log('\n=== ALL API CALLS (tenant) ===');
  api.forEach(r => console.log(`  [${r.status}] ${r.url}`));
  const failed = api.filter(r => r.status >= 400);
  console.log('\n=== FAILED ===');
  failed.forEach(r => console.log(`  [${r.status}] ${r.url}`));
});

test('tenant content list renders items', async ({ page }) => {
  const log = [];
  attachListeners(page, log);
  await loginAs(page, TENANT_EMAIL, TENANT_PASS);

  const body = await page.locator('body').innerText();
  console.log('PAGE TEXT (first 800):\n', body.slice(0, 800));
  console.log('CONSOLE ERRORS:', log);
});

// ─── School admin ────────────────────────────────────────────────────────────

test('school admin login — check schoolId in localStorage', async ({ page }) => {
  const log = [];
  attachListeners(page, log);

  await loginAs(page, SCHOOL_ADMIN_EMAIL, SCHOOL_ADMIN_PASS);
  await page.screenshot({ path: 'e2e/screenshots/03-school-admin-post-login.png' });

  const schoolId = await page.evaluate(() => localStorage.getItem('schoolId'));
  const role = await page.evaluate(() => localStorage.getItem('userRole'));
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  const payload = await page.evaluate(() => {
    const t = localStorage.getItem('authToken');
    if (!t) return null;
    try { return JSON.parse(atob(t.split('.')[1])); } catch(e) { return null; }
  });

  console.log('URL:', page.url());
  console.log('role in localStorage:', role);
  console.log('schoolId in localStorage:', schoolId);
  console.log('JWT payload:', JSON.stringify(payload, null, 2));
  console.log('ERRORS:', log);

  // schoolId must be set for school-scoped API calls to work
  expect(schoolId, `schoolId not in localStorage — JWT uses school_id (snake_case) but UI reads schoolId (camelCase)`).toBeTruthy();
});

test('school admin analytics tab — check for 500', async ({ page }) => {
  const log = [];
  attachListeners(page, log);

  await loginAs(page, SCHOOL_ADMIN_EMAIL, SCHOOL_ADMIN_PASS);
  await page.screenshot({ path: 'e2e/screenshots/04-school-admin-content.png' });

  const analyticsTab = page.locator('button:has-text("Analytics"), a:has-text("Analytics")').first();
  if (await analyticsTab.count() > 0) {
    await analyticsTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/05-analytics-tab.png' });
  } else {
    console.log('Analytics tab not found — page text:', (await page.locator('body').innerText()).slice(0, 400));
  }

  const errors500 = log.filter(l => l.includes('[http 5'));
  console.log('ALL ERRORS:', log);
  expect(errors500, `500s on analytics: ${errors500.join('\n')}`).toHaveLength(0);
});

// ─── Full network audit ───────────────────────────────────────────────────────

test('school admin — capture all API calls', async ({ page }) => {
  const requests = [];
  page.on('response', res => requests.push({ url: res.url(), status: res.status() }));

  await loginAs(page, SCHOOL_ADMIN_EMAIL, SCHOOL_ADMIN_PASS);
  await page.waitForTimeout(2000);

  // try clicking around
  const tabs = page.locator('button, a').filter({ hasText: /content|analytics|school|class/i });
  const count = await tabs.count();
  for (let i = 0; i < Math.min(count, 4); i++) {
    try { await tabs.nth(i).click(); await page.waitForTimeout(1000); } catch (_) {}
  }

  const api = requests.filter(r => r.url.includes('onrender.com'));
  console.log('\n=== ALL API CALLS (school admin) ===');
  api.forEach(r => console.log(`  [${r.status}] ${r.url}`));
  const failed = api.filter(r => r.status >= 400);
  console.log('\n=== FAILED ===');
  failed.forEach(r => console.log(`  [${r.status}] ${r.url}`));
});
