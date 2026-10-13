import type { Page } from '@playwright/test';

const FIRST_PAGE_CHECK_MS = 3000;

export interface PollOptions {
  timeout?: number;
  interval?: number;
}

export class ContentListPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get syncAllButton() {
    return this.page.getByRole('button', { name: 'Sync All' });
  }

  get updateIVRButton() {
    return this.page.getByRole('button', { name: 'Update IVR' });
  }

  get searchInput() {
    return this.page.getByPlaceholder(/Search by title/i);
  }

  async goto(): Promise<void> {
    // Legacy route was /content; v2 equivalent is /library.
    await this.page.goto('/library');
    await this.searchInput.waitFor({ timeout: 15000 });
  }

  row(title: string) {
    return this.page.locator('table tbody tr', { hasText: title });
  }

  /**
   * A confirm modal from an earlier step (e.g. a delete whose confirm click
   * never landed) survives client-side navigation — ModalsProvider sits at the
   * app root — and its overlay/focus trap blocks later search fills. Dismiss
   * any stray dialog before touching the search input so a leftover modal can
   * never wedge a subsequent lookup. These helpers open no modals of
   * their own, so dismissing here is always safe.
   */
  private async dismissStrayDialog(): Promise<void> {
    const dialog = this.page.getByRole('dialog');
    const open = await dialog
      .waitFor({ state: 'visible', timeout: 500 })
      .then(() => true)
      .catch(() => false);
    if (!open) return;
    await this.page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  }

  async isRowVisible(title: string, timeout = FIRST_PAGE_CHECK_MS): Promise<boolean> {
    // Unlike legacy (paginated table scan), v2 filters client-side, so narrow
    // via search first — strictly more coverage than a first-page check.
    await this.dismissStrayDialog();
    await this.searchInput.fill(title);
    return this.row(title)
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Content creation is async — POST returns a job_id, not the finished
   * record — so a new row can take seconds to minutes to appear. Reloads and
   * rechecks (via the search filter, which covers the whole library, so no
   * "Load more" paging fallback is needed) with a generous timeout.
   */
  async waitForRow(title: string, { timeout = 60000, interval = 5000 }: PollOptions = {}): Promise<void> {
    const deadline = Date.now() + timeout;
    for (;;) {
      await this.goto();
      await this.dismissStrayDialog();
      await this.searchInput.fill(title);
      const visible = await this.row(title)
        .first()
        .waitFor({ state: 'visible', timeout: FIRST_PAGE_CHECK_MS })
        .then(() => true)
        .catch(() => false);
      if (visible) return;
      if (Date.now() > deadline) {
        throw new Error(`Row "${title}" never appeared after ${timeout}ms`);
      }
      await this.page.waitForTimeout(interval);
    }
  }

  async viewContent(title: string): Promise<void> {
    await this.waitForRow(title);
    await this.row(title).first().getByRole('button', { name: 'View', exact: true }).click();
    // Legacy detail URL was /content/detail/:id; v2 is /library/:kind/:id.
    await this.page.waitForURL(/\/library\/[^/]+\/[^/]+/, { timeout: 15000 });
  }

  async editContent(title: string): Promise<void> {
    await this.waitForRow(title);
    await this.row(title).first().getByRole('button', { name: 'Edit', exact: true }).click();
    await this.page.waitForURL(/\/library\/.+\/edit/, { timeout: 15000 });
  }

  /**
   * The edit form won't render while content is still processing (v2 shows
   * 'Content is being processed, try again later!' — same string as legacy).
   * Waits for the loading indicator to clear before checking, then polls.
   */
  async waitUntilProcessed(title: string, { timeout = 120000, interval = 5000 }: PollOptions = {}): Promise<void> {
    const deadline = Date.now() + timeout;
    for (;;) {
      await this.editContent(title);
      await this.page
        .getByText('Loading…')
        .waitFor({ state: 'hidden', timeout: 15000 })
        .catch(() => undefined);
      const stillProcessing = await this.page
        .getByText('Content is being processed, try again later!')
        .isVisible()
        .catch(() => false);
      if (!stillProcessing) return; // caller is left on the edit form.
      if (Date.now() > deadline) {
        throw new Error(`Content "${title}" was still processing after ${timeout}ms`);
      }
      await this.page.waitForTimeout(interval);
    }
  }

  /**
   * v2 edits happen on ContentEditScreen (/library/:kind/:id/edit), not on the
   * create form — fills 'Title (English)', saves, and returns the PATCH status.
   */
  async updateTitleOnEditForm(newTitle: string): Promise<number> {
    const titleInput = this.page.getByLabel('Title (English)', { exact: true });
    await titleInput.waitFor({ timeout: 15000 });
    await titleInput.fill(newTitle);
    const responsePromise = this.page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && /\/content\//.test(res.url()),
    );
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    const response = await responsePromise;
    return response.status();
  }

  async deleteEitherId(idA: string, idB: string): Promise<void> {
    const target = (await this.isRowVisible(idA, FIRST_PAGE_CHECK_MS)) ? idA : idB;
    await this.deleteContent(target);
  }

  async deleteContent(title: string): Promise<void> {
    // v2 delete uses a Mantine confirm modal, not window.confirm. Scope the
    // confirm click to the dialog (same pattern as the Teachers/Schools POMs)
    // and don't return until the DELETE round-trips and the modal is gone —
    // returning early lets the open dialog block the next search fill.
    await this.waitForRow(title);
    const deleted = this.page.waitForResponse(
      (res) => res.request().method() === 'DELETE' && /\/content\//.test(res.url()),
      { timeout: 15000 },
    );
    await this.row(title).first().getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete content', exact: true }).click();
    await deleted;
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
  }
}
