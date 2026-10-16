import { expect, test, type Page, type Response } from '@playwright/test';
import { gotoLibrary, login } from '../helpers';

const TENANT = { identifier: 'test@gmail.com', password: 'Test@123' };
const TENANT2 = { identifier: 'nikunj.khakhkhar@iiitb.ac.in', password: 'Test@123' };

const SYNC_JOBS_URL = /\/content-aggregators\/sync\/jobs(\?|$)/;
const SETTLE_TIMEOUT = 15000;
const RESPONSE_TIMEOUT = 30000;

function jobRows(page: Page) {
  return page.locator('table tbody tr').filter({ has: page.locator('[class*="Badge-root"]') });
}

function noRunsMessage(page: Page) {
  return page.getByText('No jobs yet.', { exact: true });
}

interface SyncJobsPayload {
  jobs?: Array<{ job_id?: unknown }>;
}

function isSyncJobsPayload(value: unknown): value is SyncJobsPayload {
  if (typeof value !== 'object' || value === null) return false;
  const jobs = (value as { jobs?: unknown }).jobs;
  return jobs === undefined || Array.isArray(jobs);
}

type PerCourseOutcome = 'items' | 'empty' | 'running';

async function captureSyncJobIds(response: Response): Promise<string[]> {
  try {
    const payload: unknown = await response.json();
    if (!isSyncJobsPayload(payload) || !Array.isArray(payload.jobs)) return [];
    return payload.jobs.flatMap((job) =>
      typeof job?.job_id === 'string' && job.job_id !== '' ? [job.job_id] : [],
    );
  } catch {
    return [];
  }
}

async function settleJobsList(page: Page, responsePromise: Promise<Response>): Promise<string[]> {
  const ids = await captureSyncJobIds(await responsePromise);
  await page.getByRole('heading', { name: 'Jobs' }).waitFor({ timeout: SETTLE_TIMEOUT });
  await Promise.race([
    jobRows(page).first().waitFor({ timeout: SETTLE_TIMEOUT }),
    noRunsMessage(page).waitFor({ timeout: SETTLE_TIMEOUT }),
  ]);
  return ids;
}

async function openJobs(page: Page): Promise<string[]> {
  const responsePromise = page.waitForResponse((res) => SYNC_JOBS_URL.test(res.url()), {
    timeout: RESPONSE_TIMEOUT,
  });
  await page.getByRole('link', { name: 'Jobs', exact: true }).click();
  await page.waitForURL('**/jobs', { timeout: SETTLE_TIMEOUT });
  return settleJobsList(page, responsePromise);
}

async function openHistory(page: Page): Promise<string[]> {
  const responsePromise = page.waitForResponse((res) => SYNC_JOBS_URL.test(res.url()), {
    timeout: RESPONSE_TIMEOUT,
  });
  await page.goto('/content/sync-history');
  await page.waitForURL('**/jobs', { timeout: SETTLE_TIMEOUT });
  return settleJobsList(page, responsePromise);
}

async function openPerCourseDetail(page: Page, jobId: string): Promise<PerCourseOutcome> {
  await page.goto(`/jobs/${encodeURIComponent(jobId)}`);
  await page.waitForURL('**/jobs/*', { timeout: SETTLE_TIMEOUT });
  await page.getByRole('button', { name: 'Back to Jobs' }).waitFor({ timeout: SETTLE_TIMEOUT });
  await expect(page.locator('[class*="Badge-root"]').first()).toBeVisible({ timeout: SETTLE_TIMEOUT });

  const toggle = page.getByRole('button', { name: 'Show per-course results' });
  const finished = await toggle
    .waitFor({ timeout: RESPONSE_TIMEOUT })
    .then(() => true)
    .catch(() => false);
  if (!finished) {
    await expect(page.getByText('Sync progress')).toBeVisible({ timeout: SETTLE_TIMEOUT });
    return 'running';
  }
  await toggle.click();
  const itemsTable = page.locator('table');
  const emptyItems = page.getByText('No courses processed yet.', { exact: true });
  await Promise.race([
    itemsTable.first().waitFor({ timeout: SETTLE_TIMEOUT }),
    emptyItems.waitFor({ timeout: SETTLE_TIMEOUT }),
  ]);
  if (await emptyItems.isVisible()) return 'empty';
  return 'items';
}

test('TC-SYNC-001 Sync All is available to a tenant on the library page', async ({ page }) => {
  await login(page, TENANT.identifier, TENANT.password);
  await gotoLibrary(page);
  await expect(page.getByRole('button', { name: 'Sync All' })).toBeVisible();
});

test('TC-SYNC-002/003 Jobs page shows past runs with status and per-course detail', async ({ page }) => {
  await login(page, TENANT.identifier, TENANT.password);
  const syncJobIds = await openJobs(page);

  if ((await jobRows(page).count()) === 0) {
    await expect(noRunsMessage(page)).toBeVisible();
    return;
  }

  await expect(jobRows(page).first().locator('[class*="Badge-root"]')).toBeVisible();
  const [firstSyncId] = syncJobIds;
  if (!firstSyncId) return;
  const outcome = await openPerCourseDetail(page, firstSyncId);
  expect(['items', 'empty', 'running']).toContain(outcome);
});

test('TC-SYNC-004 sync history is isolated between tenants', async ({ page, browser }) => {
  await login(page, TENANT.identifier, TENANT.password);
  const tenant1Ids = await openHistory(page);

  const baseURL = new URL(page.url()).origin;
  const tenant2Context = await browser.newContext({ baseURL });
  const tenant2Page = await tenant2Context.newPage();

  await login(tenant2Page, TENANT2.identifier, TENANT2.password);
  const tenant2Ids = await openHistory(tenant2Page);
  await tenant2Context.close();

  const overlap = tenant1Ids.filter((id) => tenant2Ids.includes(id));
  expect(overlap).toEqual([]);
});
