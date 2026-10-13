import { expect, type Locator, type Page } from '@playwright/test';

// Pager shapes in src/shared/components/DataTable.tsx (read-only reference):
// - default footerLayout="range" (teachers/students/schools/jobs): Mantine
//   Buttons named Previous/Next (i18n common.previous/next), disabled at ends.
// - footerLayout="pages" (library only): Mantine <Pagination
//   aria-label="Pagination"> whose prev/next controls render the same
//   Previous/Next strings. LibraryScreen filters rows before paginating, so
//   search-based asserts there need no traversal — this helper targets the
//   range-layout tables that have no search box.
// Client-side paging: clicks only re-slice rendered rows, no network fetch.

const SETTLE_MS = 250;

function rangeNext(page: Page): Locator {
  return page.getByRole('button', { name: 'Next', exact: true });
}

function rangePrev(page: Page): Locator {
  return page.getByRole('button', { name: 'Previous', exact: true });
}

function pagesNav(page: Page): Locator {
  return page.locator('nav[aria-label="Pagination"]');
}

// Clicks the pager's next control. Returns false when already on the last
// page (or no pager rendered = single page).
export async function gotoNextPage(page: Page): Promise<boolean> {
  const nav = pagesNav(page);
  if (await nav.count()) {
    const next = nav.getByRole('button').last();
    if ((await next.count()) === 0 || (await next.isDisabled())) return false;
    await next.click();
    await page.waitForTimeout(SETTLE_MS);
    return true;
  }
  const next = rangeNext(page);
  if ((await next.count()) === 0 || (await next.isDisabled())) return false;
  await next.click();
  await page.waitForTimeout(SETTLE_MS);
  return true;
}

export async function gotoFirstPage(page: Page, maxPages = 5): Promise<void> {
  const nav = pagesNav(page);
  if (await nav.count()) {
    const first = nav.getByRole('button', { name: '1', exact: true });
    if (await first.count()) await first.click();
    return;
  }
  const prev = rangePrev(page);
  for (let i = 0; i < maxPages; i++) {
    if ((await prev.count()) === 0 || (await prev.isDisabled())) return;
    await prev.click();
  }
}

// Walks pages from page 1 until row matches. Returns true when found,
// leaving the pager on the matching page so callers can click row actions.
export async function gotoRowPage(page: Page, row: Locator, maxPages = 5): Promise<boolean> {
  await gotoFirstPage(page, maxPages);
  for (let i = 0; i < maxPages; i++) {
    if (await row.count()) return true;
    if (!(await gotoNextPage(page))) return false;
  }
  return (await row.count()) > 0;
}

export async function expectRowOnAnyPage(page: Page, row: Locator, maxPages = 5): Promise<void> {
  await gotoFirstPage(page, maxPages);
  for (let i = 0; i < maxPages; i++) {
    if (await row.count()) {
      await expect(row.first()).toBeVisible();
      return;
    }
    if (!(await gotoNextPage(page))) break;
  }
  // Fails on the last page with the standard toBeVisible message.
  await expect(row.first()).toBeVisible();
}

export async function expectRowAbsentOnAllPages(page: Page, row: Locator, maxPages = 5): Promise<void> {
  await gotoFirstPage(page, maxPages);
  for (let i = 0; i < maxPages; i++) {
    await expect(row).toHaveCount(0);
    if (!(await gotoNextPage(page))) return;
  }
}
