// @ts-check
const { test, expect } = require('@playwright/test');
const { PERSONAS } = require('../fixtures/instances');
const { LoginPage } = require('../pages/LoginPage');
const { ContentPage } = require('../pages/ContentPage');
const { SyncPage } = require('../pages/SyncPage');

// Sync All triggers a real, unbounded-duration external sync against Subodha
// (see contentAggregatorService.syncAll()) with no per-run cleanup — it is
// never clicked by these tests. TC-SYNC-001/002/003 are verified read-only:
// button presence and the Sync History page's real structure/data, without
// starting a new sync. TC-SYNC-004 proves isolation by comparing the two
// tenants' Sync History job lists (scoped server-side per tenant) instead of
// triggering a job to check for cross-tenant leakage.

test('TC-SYNC-001 Sync All is available to a tenant on the content page', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);
  const syncPage = new SyncPage(page);

  await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await contentPage.waitForLoad();
  await expect(syncPage.syncAllButton).toBeVisible();
});

test('TC-SYNC-002/003 Sync History page shows past sync runs with status and per-course detail', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);
  const syncPage = new SyncPage(page);

  await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await contentPage.waitForLoad();
  await syncPage.openHistory();

  const rowCount = await syncPage.jobRows.count();
  if (rowCount === 0) {
    await expect(syncPage.noRunsMessage).toBeVisible();
    return;
  }

  await expect(syncPage.jobRows.first().locator('[class*="sync-history-job-status-"]')).toBeVisible();
  await syncPage.expandFirstJob();
  const courseTable = page.locator('table.content-table').first();
  const emptyMessage = page.getByText('No courses processed yet.');
  await Promise.race([
    courseTable.waitFor({ timeout: 15000 }),
    emptyMessage.waitFor({ timeout: 15000 }),
  ]);
  const hasCourseTable = await courseTable.isVisible();
  const hasEmptyMessage = await emptyMessage.isVisible();
  expect(hasCourseTable || hasEmptyMessage).toBe(true);
});

test('TC-SYNC-004 sync history is isolated between tenants', async ({ page, browser }) => {
  const loginPage = new LoginPage(page);
  const contentPage = new ContentPage(page);
  const syncPage = new SyncPage(page);

  await loginPage.login(PERSONAS.tenant.identifier, PERSONAS.tenant.password);
  await contentPage.waitForLoad();
  await syncPage.openHistory();
  const tenant1Timestamps = await syncPage.jobStartedTimestamps();

  const tenant2Context = await browser.newContext();
  const tenant2Page = await tenant2Context.newPage();
  const tenant2LoginPage = new LoginPage(tenant2Page);
  const tenant2ContentPage = new ContentPage(tenant2Page);
  const tenant2SyncPage = new SyncPage(tenant2Page);

  await tenant2LoginPage.login(PERSONAS.tenant2.identifier, PERSONAS.tenant2.password);
  await tenant2ContentPage.waitForLoad();
  await tenant2SyncPage.openHistory();
  const tenant2Timestamps = await tenant2SyncPage.jobStartedTimestamps();
  await tenant2Context.close();

  const overlap = tenant1Timestamps.filter((t) => tenant2Timestamps.includes(t));
  expect(overlap).toEqual([]);
});
