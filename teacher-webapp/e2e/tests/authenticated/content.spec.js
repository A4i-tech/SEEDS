// @ts-check
const { test, expect } = require('@playwright/test');
const { ClassroomListPage } = require('../../pages/ClassroomListPage');
const { ContentDrawerPage } = require('../../pages/ContentDrawerPage');
const { ContentDetailsPage } = require('../../pages/ContentDetailsPage');

// Helper: open the Content Library and skip the test if no content is available
// for the authenticated tenant (content-dependent cases cannot be exercised
// deterministically without seeded audio content).
async function openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage) {
  await classroomListPage.goto();
  await classroomListPage.playContentButton.click();
  await contentDrawerPage.searchInput.waitFor();
  const hasContent = await contentDrawerPage.firstContentItem().isVisible().catch(() => false);
  test.skip(!hasContent, 'No content available in the library for this tenant');
}

// TC-TCONT-001: Verify Content Library opens from classrooms page
test('TC-TCONT-001 Content Library opens from classrooms page and lists content', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await classroomListPage.goto();
  await classroomListPage.playContentButton.click();

  await expect(contentDrawerPage.searchInput).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Content Library')).toBeVisible();
});

// TC-TCONT-002: Verify Content Library filter by type
test('TC-TCONT-002 filtering the Content Library by type shows only matching content', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  // Filter tabs are rendered as MUI Chips: "All" plus one chip per distinct
  // content type present in the fetched content.
  const filterTab = page.locator('.MuiChip-root').nth(1);
  const hasTypeTab = await filterTab.isVisible().catch(() => false);
  test.skip(!hasTypeTab, 'Only a single content type is available for this tenant; no type filter to test');

  const typeLabel = (await filterTab.innerText()).trim();
  await filterTab.click();

  // Each content card renders a Chip with the item's type (uppercased).
  const itemCards = page.locator('[role="presentation"]');
  await expect(itemCards.first()).toBeVisible({ timeout: 10000 });
  const typeChips = itemCards.locator(`.MuiChip-label:text-is("${typeLabel.toUpperCase()}")`);
  const cardCount = await itemCards.count();
  await expect(typeChips).toHaveCount(cardCount, { timeout: 10000 });
});

// TC-TCONT-003: Verify Content Library "All" filter resets
test('TC-TCONT-003 selecting the "All" filter resets the content list', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  const items = page.locator('[role="presentation"] .MuiTypography-body2');
  const initialCount = await items.count();

  const typeTab = page.locator('.MuiChip-root').nth(1);
  const hasTypeTab = await typeTab.isVisible().catch(() => false);
  test.skip(!hasTypeTab, 'No type filter tabs available for this tenant');

  await typeTab.click();
  await contentDrawerPage.allFilterTab.click();

  await expect(items).toHaveCount(initialCount, { timeout: 10000 });
});

// TC-TCONT-004: Verify Content Library search narrows the list
test('TC-TCONT-004 searching the Content Library narrows the list to matching items', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  const title = (await contentDrawerPage.firstContentItem().innerText()).trim();
  const searchTerm = title.slice(0, Math.max(3, Math.floor(title.length / 2)));

  await contentDrawerPage.search(searchTerm);

  const items = page.locator('[role="presentation"] .MuiTypography-body2');
  await expect(items.first()).toBeVisible({ timeout: 10000 });
  const texts = await items.allInnerTexts();
  for (const text of texts) {
    expect(text.toLowerCase()).toContain(searchTerm.toLowerCase());
  }
});

// TC-TCONT-005: Verify Content Library search with no matches
test('TC-TCONT-005 searching the Content Library with no matches shows an empty state', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await classroomListPage.goto();
  await classroomListPage.playContentButton.click();
  await contentDrawerPage.searchInput.waitFor();

  await contentDrawerPage.search('zzzznonexistenttitle');

  await expect(contentDrawerPage.noResultsMessage).toBeVisible({ timeout: 10000 });
});

// TC-TCONT-006: Verify Content Library pagination ("Load more")
test('TC-TCONT-006 Load more appends additional content items', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  const hasLoadMore = await contentDrawerPage.loadMoreButton.isVisible().catch(() => false);
  test.skip(!hasLoadMore, 'Content list fits on a single page for this tenant; Load more is not available');

  const items = page.locator('[role="presentation"] .MuiTypography-body2');
  const beforeCount = await items.count();

  const listResponse = page.waitForResponse(
    (res) => res.url().includes('/content') && res.request().method() === 'GET'
  );
  await contentDrawerPage.loadMoreButton.click();
  await listResponse;

  await expect(async () => {
    expect(await items.count()).toBeGreaterThan(beforeCount);
  }).toPass({ timeout: 10000 });
});

// TC-TCONT-007: Verify opening a content item plays it with correct title/duration
test('TC-TCONT-007 opening a content item plays it with the correct title and duration', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  const title = (await contentDrawerPage.firstContentItem().innerText()).trim();

  const sasUrlResponse = page.waitForResponse(
    (res) => res.url().includes('/content/') && res.request().method() === 'GET'
  );
  await contentDrawerPage.playContent(title);
  await sasUrlResponse;

  await expect(contentDrawerPage.nowPlayingLabel).toBeVisible({ timeout: 15000 });
  await expect(contentDrawerPage.nowPlayingTitle).toHaveText(title, { timeout: 15000 });
  await expect(contentDrawerPage.playPauseButton).toBeVisible();

  // Verify the audio element actually loads a duration (metadata loaded).
  await expect.poll(
    async () => contentDrawerPage.audio.evaluate((el) => el.duration).catch(() => NaN),
    { timeout: 15000 }
  ).toBeGreaterThan(0);
});

// TC-TCONT-008: Verify pause and resume playback
test('TC-TCONT-008 pausing and resuming playback keeps position', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  const title = (await contentDrawerPage.firstContentItem().innerText()).trim();
  await contentDrawerPage.playContent(title);
  await expect(contentDrawerPage.nowPlayingLabel).toBeVisible({ timeout: 15000 });

  // Ensure playback has actually started.
  await expect.poll(
    async () => contentDrawerPage.audio.evaluate((el) => !el.paused).catch(() => false),
    { timeout: 15000 }
  ).toBe(true);

  await expect(contentDrawerPage.playPauseButton).toHaveAccessibleName('Pause');
  await contentDrawerPage.playPauseButton.click(); // Pause

  await expect.poll(
    async () => contentDrawerPage.audio.evaluate((el) => el.paused).catch(() => false),
    { timeout: 10000 }
  ).toBe(true);
  const pausedAt = await contentDrawerPage.getCurrentTime();

  await expect(contentDrawerPage.playPauseButton).toHaveAccessibleName('Play');
  await contentDrawerPage.playPauseButton.click(); // Resume

  await expect.poll(
    async () => contentDrawerPage.audio.evaluate((el) => !el.paused).catch(() => false),
    { timeout: 10000 }
  ).toBe(true);
  const resumedAt = await contentDrawerPage.getCurrentTime();

  expect(resumedAt).toBeGreaterThanOrEqual(pausedAt - 0.5);
});

// TC-TCONT-009: Verify rewind control moves playback position back
test('TC-TCONT-009 rewind control moves playback position back', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  const title = (await contentDrawerPage.firstContentItem().innerText()).trim();
  await contentDrawerPage.playContent(title);
  await expect(contentDrawerPage.nowPlayingLabel).toBeVisible({ timeout: 15000 });

  // Let playback advance briefly so there is something to rewind.
  await expect.poll(
    async () => contentDrawerPage.audio.evaluate((el) => el.currentTime).catch(() => 0),
    { timeout: 15000 }
  ).toBeGreaterThan(1);

  const beforeRewind = await contentDrawerPage.getCurrentTime();
  await contentDrawerPage.rewindButton.click();

  await expect.poll(
    async () => contentDrawerPage.getCurrentTime(),
    { timeout: 10000 }
  ).toBeLessThan(beforeRewind);
});

// TC-TCONT-010: Verify playback speed control
test('TC-TCONT-010 selecting a playback speed changes the audio playback rate', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  const title = (await contentDrawerPage.firstContentItem().innerText()).trim();
  await contentDrawerPage.playContent(title);
  await expect(contentDrawerPage.nowPlayingLabel).toBeVisible({ timeout: 15000 });
  await expect(contentDrawerPage.speedSelect).toBeVisible({ timeout: 15000 });

  const speedCases = [
    { label: '0.75x', rate: 0.75 },
    { label: '1.25x', rate: 1.25 },
    { label: '1.5x', rate: 1.5 },
    { label: '2x', rate: 2 },
    { label: '1x', rate: 1 },
  ];

  for (const { label, rate } of speedCases) {
    await contentDrawerPage.selectSpeed(label);
    await expect.poll(
      async () => contentDrawerPage.getPlaybackRate(),
      { timeout: 10000 }
    ).toBe(rate);
    expect(await contentDrawerPage.getPreservesPitch()).toBe(true);
  }
});

// TC-TCONT-011: Verify closing the Content Library
test('TC-TCONT-011 closing the Content Library closes the dialog', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await classroomListPage.goto();
  await classroomListPage.playContentButton.click();
  await expect(contentDrawerPage.searchInput).toBeVisible({ timeout: 10000 });

  await contentDrawerPage.closeButton.click();

  await expect(contentDrawerPage.searchInput).toBeHidden({ timeout: 10000 });
});

// REG-594-TITLE (#594 regression): Verify the content title shown via the
// Teacher WebApp read-only content details route matches the title returned
// by the backend API, rather than relying on a locally cached/derived title.
test('REG-594-TITLE [#594 regression] content details page title matches the API response', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  const title = (await contentDrawerPage.firstContentItem().innerText()).trim();

  const playResponse = page.waitForResponse(
    (res) => res.url().includes('/content/') && res.request().method() === 'GET'
  );
  await contentDrawerPage.playContent(title);
  const contentId = new URL((await playResponse).url()).pathname.split('/').filter(Boolean).pop();

  const contentDetailsPage = new ContentDetailsPage(page);
  const detailsResponse = page.waitForResponse(
    (res) => res.url().endsWith(`/content/${contentId}`) && res.request().method() === 'GET'
  );
  await contentDetailsPage.goto(contentId);
  const body = await (await detailsResponse).json();
  const expectedTitle = body.title.english && body.title.local
    ? `${body.title.english} (${body.title.local})`
    : body.title.english || body.title.local || 'Untitled';

  await expect(contentDetailsPage.title).toHaveText(expectedTitle, { timeout: 10000 });
});
