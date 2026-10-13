import { expect, type Locator, type Page, type Response } from '@playwright/test';

const SYNC_JOBS_URL = /\/content-aggregators\/sync\/jobs(\?|$)/;
const SETTLE_TIMEOUT = 15000;
const RESPONSE_TIMEOUT = 30000;

interface SyncJobsPayload {
  jobs?: Array<{ job_id?: unknown }>;
}

function isSyncJobsPayload(value: unknown): value is SyncJobsPayload {
  if (typeof value !== 'object' || value === null) return false;
  const jobs = (value as { jobs?: unknown }).jobs;
  return jobs === undefined || Array.isArray(jobs);
}

export type PerCourseOutcome = 'items' | 'empty' | 'running';

export class SyncPage {
  readonly page: Page;
  readonly syncAllButton: Locator;
  readonly jobsNavLink: Locator;
  readonly jobRows: Locator;
  readonly firstJobStatus: Locator;
  readonly noRunsMessage: Locator;
  readonly detailStatus: Locator;
  readonly backToJobsButton: Locator;
  private lastSyncJobIds: string[] = [];

  constructor(page: Page) {
    this.page = page;
    this.syncAllButton = page.getByRole('button', { name: 'Sync All' });
    this.jobsNavLink = page.getByRole('link', { name: 'Jobs', exact: true });
    // JobsScreen renders one DataTable <tr> per job. Loading skeletons and the
    // empty state carry no StatusBadge, so badge-scoped rows never match a
    // placeholder — the v2 equivalent of the legacy skeleton guard.
    this.jobRows = page.locator('table tbody tr').filter({ has: page.locator('[class*="Badge-root"]') });
    this.firstJobStatus = this.jobRows.first().locator('[class*="Badge-root"]');
    this.noRunsMessage = page.getByText('No jobs yet.', { exact: true });
    this.detailStatus = page.locator('[class*="Badge-root"]').first();
    this.backToJobsButton = page.getByRole('button', { name: 'Back to Jobs' });
  }

  async openLibrary(): Promise<void> {
    await this.page.goto('/library');
    await this.page.getByRole('heading', { name: 'Content Library' }).waitFor({ timeout: SETTLE_TIMEOUT });
  }

  private async captureSyncJobIds(response: Response): Promise<void> {
    try {
      const payload: unknown = await response.json();
      if (!isSyncJobsPayload(payload) || !Array.isArray(payload.jobs)) {
        this.lastSyncJobIds = [];
        return;
      }
      this.lastSyncJobIds = payload.jobs.flatMap((job) =>
        typeof job?.job_id === 'string' && job.job_id !== '' ? [job.job_id] : [],
      );
    } catch {
      this.lastSyncJobIds = [];
    }
  }

  syncJobIds(): string[] {
    return [...this.lastSyncJobIds];
  }

  private async waitForJobsSettled(): Promise<void> {
    await Promise.race([
      this.jobRows.first().waitFor({ timeout: SETTLE_TIMEOUT }),
      this.noRunsMessage.waitFor({ timeout: SETTLE_TIMEOUT }),
    ]);
  }

  private async settleJobsList(responsePromise: Promise<Response>): Promise<void> {
    await this.captureSyncJobIds(await responsePromise);
    await this.page.getByRole('heading', { name: 'Jobs' }).waitFor({ timeout: SETTLE_TIMEOUT });
    await this.waitForJobsSettled();
  }

  async openJobs(): Promise<void> {
    const responsePromise = this.page.waitForResponse((res) => SYNC_JOBS_URL.test(res.url()), {
      timeout: RESPONSE_TIMEOUT,
    });
    await this.jobsNavLink.click();
    await this.page.waitForURL('**/jobs', { timeout: SETTLE_TIMEOUT });
    await this.settleJobsList(responsePromise);
  }

  async openHistory(): Promise<void> {
    // Legacy /content/sync-history redirects to /jobs (see router.tsx).
    const responsePromise = this.page.waitForResponse((res) => SYNC_JOBS_URL.test(res.url()), {
      timeout: RESPONSE_TIMEOUT,
    });
    await this.page.goto('/content/sync-history');
    await this.page.waitForURL('**/jobs', { timeout: SETTLE_TIMEOUT });
    await this.settleJobsList(responsePromise);
  }

  async openJobDetail(jobId: string): Promise<void> {
    await this.page.goto(`/jobs/${encodeURIComponent(jobId)}`);
    await this.page.waitForURL('**/jobs/*', { timeout: SETTLE_TIMEOUT });
    await this.backToJobsButton.waitFor({ timeout: SETTLE_TIMEOUT });
    await expect(this.detailStatus).toBeVisible({ timeout: SETTLE_TIMEOUT });
  }

  async expandFirstJob(): Promise<void> {
    // v2 rows have no inline expansion and sync-row actions route to /library,
    // so "expand" opens the first captured sync job's detail page directly.
    const [first] = this.syncJobIds();
    if (!first) throw new Error('expandFirstJob: no sync job ids captured; call openJobs/openHistory first');
    await this.openJobDetail(first);
  }

  async waitForPerCourseDetail(): Promise<PerCourseOutcome> {
    // Finished jobs gate per-course rows behind a toggle; running jobs show
    // progress instead. Polling stays generous in both branches.
    const toggle = this.page.getByRole('button', { name: 'Show per-course results' });
    const finished = await toggle
      .waitFor({ timeout: RESPONSE_TIMEOUT })
      .then(() => true)
      .catch(() => false);
    if (!finished) {
      await expect(this.page.getByText('Sync progress')).toBeVisible({ timeout: SETTLE_TIMEOUT });
      return 'running';
    }
    await toggle.click();
    const itemsTable = this.page.locator('table');
    const emptyItems = this.page.getByText('No courses processed yet.', { exact: true });
    await Promise.race([
      itemsTable.first().waitFor({ timeout: SETTLE_TIMEOUT }),
      emptyItems.waitFor({ timeout: SETTLE_TIMEOUT }),
    ]);
    if (await emptyItems.isVisible()) return 'empty';
    return 'items';
  }
}
