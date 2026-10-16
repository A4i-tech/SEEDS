// @ts-check

class ContentDrawerPage {
  constructor(page) {
    this.page = page;
    this.searchInput = page.getByPlaceholder('Search songs, stories...');
    this.closeButton = page.getByRole('button', { name: 'Close' });
    this.loadMoreButton = page.getByRole('button', { name: 'Load more' });
    this.allFilterTab = page.getByRole('button', { name: 'All', exact: true });
    this.noResultsMessage = page.getByText(/no content matches your search/i);
    this.nowPlayingLabel = page.getByText('Now Playing', { exact: true });
    this.nowPlayingTitle = this.nowPlayingLabel.locator('xpath=following-sibling::*[1]');
    this.playPauseButton = page.getByRole('button', { name: /^Play$|^Pause$/ });
    this.rewindButton = page.getByRole('button', { name: 'Rewind 10 seconds' });
    this.speedSelect = page.getByLabel('Playback speed');
    this.audio = page.locator('audio');
  }

  contentItem(title) {
    return this.page.getByText(title, { exact: false });
  }

  filterTab(label) {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  firstContentItem() {
    return this.page.locator('[role="presentation"] .MuiTypography-body2').first();
  }

  async search(query) {
    await this.searchInput.fill(query);
  }

  async playContent(title) {
    await this.contentItem(title).click();
  }

  async selectSpeed(speedLabel) {
    await this.speedSelect.click();
    await this.page.getByRole('option', { name: speedLabel, exact: true }).click();
  }

  async getPlaybackRate() {
    return this.audio.evaluate((el) => el.playbackRate);
  }

  async getCurrentTime() {
    return this.audio.evaluate((el) => el.currentTime);
  }

  async getPreservesPitch() {
    return this.audio.evaluate((el) =>
      el.preservesPitch ?? el.mozPreservesPitch ?? el.webkitPreservesPitch
    );
  }
}

module.exports = { ContentDrawerPage };
