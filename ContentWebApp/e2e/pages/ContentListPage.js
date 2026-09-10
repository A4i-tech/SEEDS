// @ts-check

class ContentListPage {
  constructor(page) {
    this.page = page;
    this.syncAllButton = page.getByRole('button', { name: /^Sync All$/ });
    this.syncHistoryButton = page.getByRole('button', { name: /^Sync History$/ });
    this.updateIVRButton = page.getByRole('button', { name: /^Update IVR$/ });
    this.syncProgress = page.locator('.content-aggregator-sync-all-progress');
    this.loadMoreButton = page.getByRole('button', { name: /^Load more$/ });
  }

  async goto() {
    await this.page.goto('/content');
  }

  row(title) {
    return this.page.locator('tr.table-row-white', { hasText: title });
  }

  async isRowVisible(title, timeout = 3000) {
    return this.row(title)
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * POST /content does not create the record synchronously — it returns
   * `{"message": "Processing New Content job scheduled!", "job_id": ...}` and
   * a background job creates the actual content afterward (confirmed live via
   * the raw response body). So there is no id to grab at creation time, and a
   * new row's appearance time is genuinely unpredictable — anywhere from a few
   * seconds to multiple minutes depending on backend job-queue load (which
   * this test suite itself contributes to; avoid rapid-fire content creation
   * where possible). Reloads and rechecks page 1 (content is assumed sorted
   * newest-first) with a generous timeout, falling back to a few pages of
   * "Load more" in case that assumption is wrong for a given account.
   */
  async waitForRow(title, { timeout = 60000, interval = 5000, maxPages = 5 } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      await this.goto();
      for (let i = 0; i < maxPages; i++) {
        if (await this.isRowVisible(title, i === 0 ? 3000 : 1500)) return;
        if (!(await this.loadMoreButton.isVisible().catch(() => false))) break;
        await this.loadMoreButton.click();
        await this.page.waitForTimeout(500);
      }
      if (Date.now() > deadline) {
        throw new Error(`Row "${title}" never appeared after ${timeout}ms`);
      }
      await this.page.waitForTimeout(interval);
    }
  }

  async viewContent(title) {
    await this.waitForRow(title);
    await this.row(title).getByRole('button', { name: 'View' }).click();
  }

  async editContent(title) {
    await this.waitForRow(title);
    await this.row(title).getByRole('button', { name: 'Edit' }).click();
  }

  /**
   * ContentEdit.js refuses to render the edit form at all while the content
   * is unprocessed ("Content is being processed, try again later!" —
   * confirmed live). Re-finds and re-opens Edit on each attempt since the
   * async creation job (see waitForRow's note) may still be settling the
   * record's position in the list too.
   *
   * ContentEdit.js shows its own "Loading..." state while it fetches the
   * content record, before it knows whether processing is done — checking
   * for the "still processing" text before that fetch resolves can find
   * neither "Loading..." nor "still processing" in the DOM yet, wrongly
   * conclude processing is done, and return with the caller left on a page
   * that hasn't rendered the edit form at all (confirmed live via trace: the
   * check ran 8ms after navigating to the edit page, while it was still
   * showing "Loading...", and the page went on to render "still processing"
   * a moment later — the caller then hung forever waiting for a form field
   * that page state never has). Wait for "Loading..." to clear first.
   */
  async waitUntilProcessed(title, { timeout = 120000, interval = 5000 } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      await this.editContent(title);
      await this.page.getByText('Loading...').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
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

  async deleteContent(title) {
    // useContent.js's deleteContent uses native window.confirm + alert.
    await this.waitForRow(title);
    this.page.once('dialog', (dialog) => dialog.accept());
    await this.row(title).getByRole('button', { name: 'Delete' }).click();
  }
}

module.exports = { ContentListPage };
