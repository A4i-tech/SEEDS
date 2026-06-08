/**
 * Interactive binary search for minimum acceptable network speed.
 *
 * Searches between 100 Kbps and 10 Mbps. At each midpoint it:
 *   1. Throttles the browser to that speed
 *   2. Logs in using TEST_PHONE / TEST_PASSWORD from .env
 *   3. Runs key requests and prints timing
 *   4. Asks: "Satisfied? (y/n)"
 *      y → try lower bandwidth  (high = mid)
 *      n → try higher bandwidth (low = mid + 1)
 *
 * Usage:
 *   node tests/e2e/network-speed-search.js
 *
 * Required .env vars:
 *   REACT_APP_API_BASE_URL
 *   REACT_APP_CONF_SERVER_BASE_URI
 *   PLAYWRIGHT_BASE_URL
 *   TEST_PHONE
 *   TEST_PASSWORD
 */

require('dotenv').config();
const { chromium } = require('@playwright/test');
const readline = require('readline');

const BASE_URL     = process.env.PLAYWRIGHT_BASE_URL;
const BACKEND_URL  = process.env.REACT_APP_API_BASE_URL?.trim();
const CONF_URL     = process.env.REACT_APP_CONF_SERVER_BASE_URI?.trim();
const TEST_PHONE   = process.env.TEST_PHONE;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

for (const [name, val] of Object.entries({ PLAYWRIGHT_BASE_URL: BASE_URL, REACT_APP_API_BASE_URL: BACKEND_URL, REACT_APP_CONF_SERVER_BASE_URI: CONF_URL, TEST_PHONE, TEST_PASSWORD })) {
  if (!val) { console.error(`Missing required env var: ${name}`); process.exit(1); }
}

// Binary search bounds in bytes/s
const LOW_BPS  = 12_500;       // 100 Kbps
const HIGH_BPS = 1_250_000;    // 10 Mbps

function bpsToLabel(bps) {
  const kbps = (bps * 8) / 1000;
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps.toFixed(0)} Kbps`;
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function runAtSpeed(bps) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page    = await context.newPage();
  const cdp     = await context.newCDPSession(page);

  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: bps,
    uploadThroughput:   bps,
    latency: 0,
  });

  const results = {};

  try {
    // --- Login ---
    await page.goto('/');
    await page.locator('input[type="tel"]').fill(TEST_PHONE);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);

    let t0 = Date.now();
    const [loginRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/teacher/login')),
      page.locator('button:has-text("Login")').click(),
    ]);
    results.login = { status: loginRes.status(), ms: Date.now() - t0 };

    if (loginRes.status() !== 200) {
      console.log(`  ✗ Login failed (${loginRes.status()}) — check TEST_PHONE / TEST_PASSWORD`);
      return results;
    }

    // --- Classroom list ---
    t0 = Date.now();
    const classRes = await page.waitForResponse(
      res => res.url().includes(`${BACKEND_URL}/class`) && res.request().method() === 'GET',
      { timeout: 35_000 }
    );
    if (classRes) results.classroomList = { status: classRes.status(), ms: Date.now() - t0 };

    // --- Open first classroom via "View" button ---
    // Wait for React to render cards after the API response
    const viewBtn = page.locator('button:has-text("View")').first();
    await viewBtn.waitFor({ state: 'visible', timeout: 15_000 }).catch(async () => {
      // Fallback: navigate directly to classrooms if not already there
      await page.goto('/classrooms');
      await viewBtn.waitFor({ state: 'visible', timeout: 15_000 });
    });
    const classExists = await viewBtn.isVisible().catch(() => false);
    if (!classExists) { results.error = 'No classroom "View" button found'; return results; }

    t0 = Date.now();
    const [detailRes] = await Promise.all([
      page.waitForResponse(res => res.url().match(/\/class\/[^/]+$/) && res.request().method() === 'GET', { timeout: 35_000 }),
      viewBtn.click(),
    ]);
    if (detailRes) results.classroomDetail = { status: detailRes.status(), ms: Date.now() - t0 };

    // --- Select first student ---
    const firstStudent = page.locator('li[class*="MuiListItem"]').first();
    await firstStudent.waitFor({ timeout: 10_000 });
    await firstStudent.click();

    // --- Start Conference button (green page-level button, exact case) ---
    const startConfBtn = page.getByRole('button', { name: 'Start Conference', exact: true });
    await startConfBtn.waitFor({ timeout: 5_000 });

    t0 = Date.now();
    const [confCreateRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/conference/create'), { timeout: 35_000 }),
      (async () => {
        await startConfBtn.click();
        // Dialog: "Assign leader for this call" — pick "No leader" then confirm
        await page.locator('text=Assign leader for this call').waitFor({ timeout: 5_000 });
        await page.locator('[value=""]').first().click(); // "No leader" radio
        // Dialog confirm button (lowercase 'c', exact match)
        await page.getByRole('button', { name: 'Start conference', exact: true }).click();
      })(),
    ]);
    results.conferenceCreate = { status: confCreateRes.status(), ms: Date.now() - t0 };
    if (confCreateRes.status() !== 200 && confCreateRes.status() !== 201) return results;

    // --- Start Call ---
    const startCallBtn = page.locator('[aria-label="Start call"]');
    await startCallBtn.waitFor({ timeout: 10_000 });
    t0 = Date.now();
    const [startCallRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/conference/start/'), { timeout: 35_000 }),
      startCallBtn.click(),
    ]);
    results.startCall = { status: startCallRes.status(), ms: Date.now() - t0 };

    // --- Wait 30 seconds ---
    console.log('  … waiting 30s …');
    await page.waitForTimeout(30_000);

    // --- End Call ---
    const endCallBtn = page.locator('[aria-label="End call"]');
    await endCallBtn.waitFor({ timeout: 10_000 });
    t0 = Date.now();
    const [endCallRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/conference/end/'), { timeout: 35_000 }),
      endCallBtn.click(),
    ]);
    results.endCall = { status: endCallRes.status(), ms: Date.now() - t0 };

    // --- End Conference (sink) ---
    const endConfBtn = page.locator('[aria-label="End conference"]');
    await endConfBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="End conference"]')?.disabled,
      { timeout: 10_000 }
    );
    t0 = Date.now();
    const [sinkRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/conference/sink/'), { timeout: 35_000 }),
      endConfBtn.click(),
    ]);
    results.endConference = { status: sinkRes.status(), ms: Date.now() - t0 };

  } catch (err) {
    results.error = err.message;
  } finally {
    await browser.close();
  }

  return results;
}

function printResults(bps, results) {
  console.log(`\n── Results at ${bpsToLabel(bps)} ──`);
  for (const [key, val] of Object.entries(results)) {
    if (key === 'error') {
      console.log(`  ✗ Error: ${val}`);
    } else {
      const icon = val.status < 400 ? '✓' : '✗';
      console.log(`  ${icon} ${key.padEnd(16)} status=${val.status}  time=${val.ms.toFixed ? val.ms.toFixed(0) : val.ms}ms`);
    }
  }
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`\nBinary search: ${bpsToLabel(LOW_BPS)} → ${bpsToLabel(HIGH_BPS)}`);
  console.log('Answer y = app works fine at this speed, n = too slow / unacceptable\n');

  let low  = LOW_BPS;
  let high = HIGH_BPS;
  let lastSatisfied = null;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    console.log(`\nTesting at ${bpsToLabel(mid)} ...`);

    const results = await runAtSpeed(mid);
    printResults(mid, results);

    const answer = (await ask(rl, `\nSatisfied at ${bpsToLabel(mid)}? (y/n): `)).trim().toLowerCase();

    if (answer === 'y') {
      lastSatisfied = mid;
      high = mid;         // try lower — maybe it works at even less
    } else {
      low = mid + 1;      // need more bandwidth
    }
  }

  rl.close();

  console.log('\n══════════════════════════════');
  if (lastSatisfied !== null) {
    console.log(`Minimum acceptable speed: ${bpsToLabel(lastSatisfied)}`);
  } else {
    console.log(`App was not acceptable at any speed up to ${bpsToLabel(HIGH_BPS)}`);
  }
  console.log('══════════════════════════════\n');
}

main().catch(err => { console.error(err); process.exit(1); });
