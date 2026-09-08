// @ts-check
class SyncPage {
  constructor(page) {
    this.page = page;
    this.syncAllButton = page.getByRole('button', { name: /^Sync All$|^Syncing\.\.\.$/ });
    this.syncHistoryButton = page.getByRole('button', { name: 'Sync History' });
    // Skeleton placeholder rows (SyncHistoryJobListSkeleton) share the
    // "sync-history-job-summary" class but render as <div>, not <button> —
    // scope to the real element so we never read/click a loading placeholder.
    this.jobRows = page.locator('button.sync-history-job-summary');
    this.jobStarted = page.locator('button.sync-history-job-summary .sync-history-job-started');
    this.noRunsMessage = page.getByText('No sync runs yet.');
  }

  async openHistory() {
    const responsePromise = this.page.waitForResponse((res) => /\/content-aggregators\/sync\/jobs(\?|$)/.test(res.url()));
    await this.syncHistoryButton.click();
    await this.page.waitForURL('**/content/sync-history', { timeout: 15000 });
    await responsePromise;
    await this.page.locator('.card-title', { hasText: 'Sync History' }).waitFor();
  }

  async jobStartedTimestamps() {
    await Promise.race([
      this.jobRows.first().waitFor({ timeout: 10000 }).catch(() => {}),
      this.noRunsMessage.waitFor({ timeout: 10000 }).catch(() => {}),
    ]);
    return this.jobStarted.allTextContents();
  }

  async expandFirstJob() {
    await this.jobRows.first().click();
  }
}

module.exports = { SyncPage };
