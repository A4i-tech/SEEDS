import { expect, test, type Page } from '@playwright/test';
import { SyncPage } from '../pages/SyncPage';

const TENANT = { identifier: 'test@gmail.com', password: 'Test@123' };
const TENANT2 = { identifier: 'nikunj.khakhkhar@iiitb.ac.in', password: 'Test@123' };

async function loginAs(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel(/phone number or email/i).fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
}

// Sync All triggers a real, unbounded external sync — never clicked here.
// TC-SYNC-001/002/003 are read-only checks of the Library/Jobs pages.
// TC-SYNC-004 checks isolation by comparing each tenant's own sync job ids,
// without triggering a new sync.

test('TC-SYNC-001 Sync All is available to a tenant on the library page', async ({ page }) => {
  const syncPage = new SyncPage(page);

  await loginAs(page, TENANT.identifier, TENANT.password);
  await syncPage.openLibrary();
  await expect(syncPage.syncAllButton).toBeVisible();
});

test('TC-SYNC-002/003 Jobs page shows past runs with status and per-course detail', async ({ page }) => {
  const syncPage = new SyncPage(page);

  await loginAs(page, TENANT.identifier, TENANT.password);
  await syncPage.openJobs();

  const rowCount = await syncPage.jobRows.count();
  if (rowCount === 0) {
    await expect(syncPage.noRunsMessage).toBeVisible();
    return;
  }

  await expect(syncPage.firstJobStatus).toBeVisible();
  const [firstSyncId] = syncPage.syncJobIds();
  // Jobs merges every job type; with only remediation jobs present there is no
  // per-course detail to open, so the list assertions above are the coverage.
  if (!firstSyncId) return;
  await syncPage.expandFirstJob();
  const outcome = await syncPage.waitForPerCourseDetail();
  expect(['items', 'empty', 'running']).toContain(outcome);
});

test('TC-SYNC-004 sync history is isolated between tenants', async ({ page, browser }) => {
  const syncPage = new SyncPage(page);

  await loginAs(page, TENANT.identifier, TENANT.password);
  await syncPage.openHistory();
  const tenant1Ids = syncPage.syncJobIds();

  const baseURL = new URL(page.url()).origin;
  const tenant2Context = await browser.newContext({ baseURL });
  const tenant2Page = await tenant2Context.newPage();
  const tenant2SyncPage = new SyncPage(tenant2Page);

  await loginAs(tenant2Page, TENANT2.identifier, TENANT2.password);
  await tenant2SyncPage.openHistory();
  const tenant2Ids = tenant2SyncPage.syncJobIds();
  await tenant2Context.close();

  const overlap = tenant1Ids.filter((id) => tenant2Ids.includes(id));
  expect(overlap).toEqual([]);
});
