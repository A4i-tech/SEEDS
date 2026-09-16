// @ts-check

const FIRST_PAGE_CHECK_MS = 3000;
const LOAD_MORE_PAGE_CHECK_MS = 1500;

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

  async isRowVisible(title, timeout = FIRST_PAGE_CHECK_MS) {
    return this.row(title)
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Content creation is async — POST returns a job_id, not the finished
   * record — so a new row can take seconds to minutes to appear. Reloads
   * and rechecks page 1, falling back through "Load more" if needed.
   */
  async waitForRow(title, { timeout = 60000, interval = 5000, maxPages = 5 } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      await this.goto();
      for (let i = 0; i < maxPages; i++) {
        if (await this.isRowVisible(title, i === 0 ? FIRST_PAGE_CHECK_MS : LOAD_MORE_PAGE_CHECK_MS)) return;
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
   * The edit form won't render while content is still processing. Waits for
   * the page's own "Loading..." to clear before checking — checking earlier
   * can misread a still-fetching page as already done, leaving the caller
   * stuck on a form that never appears (confirmed live via trace).
   */
  async waitUntilProcessed(title, { timeout = 120000, interval = 5000 } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      await this.editContent(title);
      await this.page.getByText('Loading...').waitFor({ state: 'hidden', timeout: 15000 });
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

  async deleteEitherId(idA, idB) {
    const target = (await this.isRowVisible(idA, FIRST_PAGE_CHECK_MS)) ? idA : idB;
    await this.deleteContent(target);
  }

  async deleteContent(title) {
    // useContent.js's deleteContent uses native window.confirm + alert.
    await this.waitForRow(title);
    this.page.once('dialog', (dialog) => dialog.accept());
    await this.row(title).getByRole('button', { name: 'Delete' }).click();
  }
}

module.exports = { ContentListPage };
