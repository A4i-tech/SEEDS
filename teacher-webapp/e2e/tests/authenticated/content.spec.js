// @ts-check
const { test, expect } = require('@playwright/test');
const { ClassroomListPage } = require('../../pages/ClassroomListPage');
const { ContentDrawerPage } = require('../../pages/ContentDrawerPage');
const { ContentDetailsPage } = require('../../pages/ContentDetailsPage');
const { openLibraryOrSkip } = require('../../fixtures/classroomHelpers');

test('TC-TCONT-001 Content Library opens from classrooms page and lists content', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await classroomListPage.goto();
  await classroomListPage.playContentButton.click();

  await expect(contentDrawerPage.searchInput).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Content Library')).toBeVisible();
});

test('TC-TCONT-002 filtering the Content Library by type shows only matching content', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  // Filter tabs are rendered as Chips in the labelled filter group: "All"
  // plus one chip per distinct content type present in the fetched content.
  const typeTabs = contentDrawerPage.filterGroup.getByRole('button').filter({ hasNotText: 'All' });
  const hasTypeTab = (await typeTabs.count()) > 0;
  test.skip(!hasTypeTab, 'Only a single content type is available for this tenant; no type filter to test');
  const filterTab = typeTabs.first();

  const typeLabel = (await filterTab.innerText()).trim();
  await filterTab.click();

  // Each content card renders a Chip with the item's type (uppercased).
  const itemCards = contentDrawerPage.itemCards;
  await expect(itemCards.first()).toBeVisible({ timeout: 10000 });
  const cardCount = await itemCards.count();
  const typeChips = itemCards.filter({ has: page.locator(`.MuiChip-label:text-is("${typeLabel.toUpperCase()}")`) });
  await expect(typeChips).toHaveCount(cardCount, { timeout: 10000 });
});

test('TC-TCONT-003 selecting the "All" filter resets the content list', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await openLibraryOrSkip(test, page, classroomListPage, contentDrawerPage);

  const items = page.locator('[role="presentation"] .MuiTypography-body2');
  const initialCount = await items.count();

  const typeTabs = contentDrawerPage.filterGroup.getByRole('button').filter({ hasNotText: 'All' });
  const hasTypeTab = (await typeTabs.count()) > 0;
  test.skip(!hasTypeTab, 'No type filter tabs available for this tenant');

  await typeTabs.first().click();
  await contentDrawerPage.allFilterTab.click();

  await expect(items).toHaveCount(initialCount, { timeout: 10000 });
});

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

test('TC-TCONT-005 searching the Content Library with no matches shows an empty state', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await classroomListPage.goto();
  await classroomListPage.playContentButton.click();
  await contentDrawerPage.searchInput.waitFor();

  await contentDrawerPage.search('zzzznonexistenttitle');

  await expect(contentDrawerPage.noResultsMessage).toBeVisible({ timeout: 10000 });
});

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

test('TC-TCONT-011 closing the Content Library closes the dialog', async ({ page }) => {
  const classroomListPage = new ClassroomListPage(page);
  const contentDrawerPage = new ContentDrawerPage(page);

  await classroomListPage.goto();
  await classroomListPage.playContentButton.click();
  await expect(contentDrawerPage.searchInput).toBeVisible({ timeout: 10000 });

  await contentDrawerPage.closeButton.click();

  await expect(contentDrawerPage.searchInput).toBeHidden({ timeout: 10000 });
});

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
  await contentDetailsPage.goto(contentId);

  await expect(contentDetailsPage.title).toContainText(title, { timeout: 10000 });
});
