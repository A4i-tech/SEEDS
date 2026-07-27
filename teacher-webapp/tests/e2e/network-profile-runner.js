/**
 * Automated network-profile sweep for the teacher-webapp conference flow.
 *
 * Runs the full conference flow (login -> classroom list -> classroom detail
 * -> start conference -> start call -> 30s hold -> end call -> end conference)
 * N times per fixed network profile, headless, no prompts. Every step's
 * result (status, ms, success/error) is appended to a CSV as it happens, so
 * a crash mid-sweep loses at most the in-flight iteration.
 *
 * Profiles reuse the 7 speeds already tested previously, now paired with
 * round-trip latency per the ranges in
 * https://github.com/A4i-tech/.github/issues/366#issuecomment-4979441130 :
 * ~300ms at 255Kbps down to ~50ms at 5.0Mbps.
 *
 * Usage:
 *   node tests/e2e/network-profile-runner.js
 *
 * Env vars:
 *   PLAYWRIGHT_BASE_URL, REACT_APP_API_BASE_URL, REACT_APP_CONF_SERVER_BASE_URI,
 *   TEST_PHONE, TEST_PASSWORD   (same as network-speed-search.js)
 *   RUNS_PER_PROFILE   default 50
 *   HOLD_MS            default 30000 (the "wait during call" step)
 *   PROFILES           comma-separated subset of profile names to run, default = all
 *   OUT_CSV            default tests/e2e/network-profile-results.csv
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE_URL      = process.env.PLAYWRIGHT_BASE_URL;
const BACKEND_URL   = process.env.REACT_APP_API_BASE_URL?.trim();
const TEST_PHONE    = process.env.TEST_PHONE;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

for (const [name, val] of Object.entries({ PLAYWRIGHT_BASE_URL: BASE_URL, REACT_APP_API_BASE_URL: BACKEND_URL, TEST_PHONE, TEST_PASSWORD })) {
  if (!val) { console.error(`Missing required env var: ${name}`); process.exit(1); }
}

const RUNS_PER_PROFILE = parseInt(process.env.RUNS_PER_PROFILE || '50', 10);
const HOLD_MS = parseInt(process.env.HOLD_MS || '30000', 10);
const OUT_CSV = path.resolve(__dirname, process.env.OUT_CSV || 'network-profile-results.csv');

function kbpsToBps(kbps) { return Math.round((kbps * 1000) / 8); }

// slow_3G / fast_3G kept verbatim (throughput in bytes/s, not kbps) from the
// reference NETWORK_PROFILES in the Docmost doc.
const ALL_PROFILES = [
  { name: '255Kbps', downloadKbps: 255,  uploadKbps: 255,  latencyMs: 300 },
  { name: '332Kbps', downloadKbps: 332,  uploadKbps: 332,  latencyMs: 250 },
  { name: 'slow_3g', downloadBps: 50_000,  uploadBps: 20_000, latencyMs: 400 },
  { name: '409Kbps', downloadKbps: 409,  uploadKbps: 409,  latencyMs: 200 },
  { name: '719Kbps', downloadKbps: 719,  uploadKbps: 719,  latencyMs: 150 },
  { name: 'fast_3g', downloadBps: 180_000, uploadBps: 84_000, latencyMs: 150 },
  { name: '1.3Mbps', downloadKbps: 1300, uploadKbps: 1300, latencyMs: 100 },
  { name: '2.6Mbps', downloadKbps: 2600, uploadKbps: 2600, latencyMs: 70 },
  { name: '5.0Mbps', downloadKbps: 5000, uploadKbps: 5000, latencyMs: 50 },
];

function resolveThroughput(profile) {
  return {
    downloadBps: profile.downloadBps ?? kbpsToBps(profile.downloadKbps),
    uploadBps:   profile.uploadBps   ?? kbpsToBps(profile.uploadKbps),
  };
}

const PROFILES = process.env.PROFILES
  ? ALL_PROFILES.filter(p => process.env.PROFILES.split(',').includes(p.name))
  : ALL_PROFILES;

const CSV_HEADER = 'profile,download_bps,upload_bps,latency_ms,iteration,endpoint,method,status,ms,success,error\n';

function csvEscape(val) {
  const s = String(val ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function appendRow(fields) {
  fs.appendFileSync(OUT_CSV, fields.map(csvEscape).join(',') + '\n');
}

async function runOnce(profile, iteration) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page    = await context.newPage();
  const cdp     = await context.newCDPSession(page);
  const { downloadBps, uploadBps } = resolveThroughput(profile);

  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: downloadBps,
    uploadThroughput:   uploadBps,
    latency:            profile.latencyMs,
  });

  const record = (endpoint, method, status, ms, error) => {
    appendRow([profile.name, downloadBps, uploadBps, profile.latencyMs, iteration, endpoint, method, status ?? '', ms ?? '', error ? 'false' : 'true', error ?? '']);
  };

  try {
    await page.goto('/');
    await page.locator('input[type="tel"]').fill(TEST_PHONE);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);

    let t0 = Date.now();
    const [loginRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/teacher/login'), { timeout: 35_000 }),
      page.locator('button:has-text("Login")').click(),
    ]);
    record('login', 'POST', loginRes.status(), Date.now() - t0);
    if (loginRes.status() !== 200) return;

    t0 = Date.now();
    const classRes = await page.waitForResponse(
      res => res.url().includes(`${BACKEND_URL}/class`) && res.request().method() === 'GET',
      { timeout: 35_000 }
    );
    record('classroomList', 'GET', classRes.status(), Date.now() - t0);

    const viewBtn = page.locator('button:has-text("View")').first();
    await viewBtn.waitFor({ state: 'visible', timeout: 15_000 }).catch(async () => {
      await page.goto('/classrooms');
      await viewBtn.waitFor({ state: 'visible', timeout: 15_000 });
    });
    if (!await viewBtn.isVisible().catch(() => false)) { record('classroomDetail', 'GET', null, null, 'No View button found'); return; }

    t0 = Date.now();
    const [detailRes] = await Promise.all([
      page.waitForResponse(res => res.url().match(/\/class\/[^/]+$/) && res.request().method() === 'GET', { timeout: 35_000 }),
      viewBtn.click(),
    ]);
    record('classroomDetail', 'GET', detailRes.status(), Date.now() - t0);

    const firstStudent = page.locator('li[class*="MuiListItem"]').first();
    await firstStudent.waitFor({ timeout: 10_000 });
    await firstStudent.click();

    const startConfBtn = page.getByRole('button', { name: 'Start Conference', exact: true });
    await startConfBtn.waitFor({ timeout: 5_000 });

    t0 = Date.now();
    const [confCreateRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/conference/create'), { timeout: 35_000 }),
      (async () => {
        await startConfBtn.click();
        await page.locator('text=Assign leader for this call').waitFor({ timeout: 5_000 });
        await page.locator('[value=""]').first().click();
        await page.getByRole('button', { name: 'Start conference', exact: true }).click();
      })(),
    ]);
    record('conferenceCreate', 'POST', confCreateRes.status(), Date.now() - t0);
    if (confCreateRes.status() !== 200 && confCreateRes.status() !== 201) return;

    const startCallBtn = page.locator('[aria-label="Start call"]');
    await startCallBtn.waitFor({ timeout: 10_000 });
    t0 = Date.now();
    const [startCallRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/conference/start/'), { timeout: 35_000 }),
      startCallBtn.click(),
    ]);
    record('startCall', 'PUT', startCallRes.status(), Date.now() - t0);

    await page.waitForTimeout(HOLD_MS);

    const endCallBtn = page.locator('[aria-label="End call"]');
    await endCallBtn.waitFor({ timeout: 10_000 });
    t0 = Date.now();
    const [endCallRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/conference/end/'), { timeout: 35_000 }),
      endCallBtn.click(),
    ]);
    record('endCall', 'PUT', endCallRes.status(), Date.now() - t0);

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
    record('endConference', 'PUT', sinkRes.status(), Date.now() - t0);

  } catch (err) {
    record('unexpected', '', null, null, err.message);
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!fs.existsSync(OUT_CSV)) fs.writeFileSync(OUT_CSV, CSV_HEADER);

  console.log(`Profiles: ${PROFILES.map(p => p.name).join(', ')}`);
  console.log(`Runs per profile: ${RUNS_PER_PROFILE}  Hold: ${HOLD_MS}ms  Output: ${OUT_CSV}\n`);

  for (const profile of PROFILES) {
    for (let i = 1; i <= RUNS_PER_PROFILE; i++) {
      process.stdout.write(`\r${profile.name}: ${i}/${RUNS_PER_PROFILE}`);
      await runOnce(profile, i);
    }
    console.log();
  }

  console.log(`\nDone. Raw rows written to ${OUT_CSV}`);
}

main().catch(err => { console.error(err); process.exit(1); });
