// @ts-check

class ContentDetailsPage {
  constructor(page) {
    this.page = page;
    this.title = page.getByRole('heading', { level: 1 });
    this.backButton = page.getByRole('button', { name: 'Back to Content' });
  }

  async goto(contentId) {
    await this.page.goto(`/content/${contentId}`);
  }
}

module.exports = { ContentDetailsPage };
