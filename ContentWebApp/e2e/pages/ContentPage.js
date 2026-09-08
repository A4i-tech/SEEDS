// @ts-check

class ContentPage {
  constructor(page) {
    this.page = page;
  }

  async waitForLoad() {
    await this.page.waitForURL('**/content', { timeout: 15000 });
  }
}

module.exports = { ContentPage };
