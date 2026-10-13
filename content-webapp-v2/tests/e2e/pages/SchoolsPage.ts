import type { Locator, Page } from '@playwright/test';
import { gotoRowPage } from './pagination';

export class SchoolsPage {
  readonly page: Page;
  readonly registrationLink: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.registrationLink = page.getByRole('link', { name: 'Registration' });
    this.createButton = page.getByRole('button', { name: 'Create school' });
  }

  async open(): Promise<void> {
    // Tenants render the school list directly at /registration (no tabs).
    // Wait for the list GET so callers never race the initial fetch.
    const schoolsFetched = this.page.waitForResponse(
      (res) => res.url().endsWith('/school') && res.request().method() === 'GET',
      { timeout: 10000 },
    );
    await this.registrationLink.click();
    await this.createButton.waitFor();
    await schoolsFetched;
  }

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async createSchool(name: string, email: string, password: string): Promise<void> {
    await this.createButton.click();
    const dialog = this.dialog();
    await dialog.getByLabel('Name *', { exact: true }).fill(name);
    await dialog.getByLabel('Email *', { exact: true }).fill(email);
    // Create dialog holds exactly one password input (edit dialog has one too, optional — this path only opens create).
    await dialog.locator('input[type="password"]').fill(password);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  }

  row(email: string): Locator {
    return this.page.locator('tr', { has: this.page.getByText(email, { exact: true }) });
  }

  async editSchool(email: string): Promise<void> {
    await gotoRowPage(this.page, this.row(email));
    await this.row(email).getByRole('button', { name: 'Edit', exact: true }).click();
    await this.dialog().getByLabel('Name *', { exact: true }).waitFor();
  }

  async saveEdit(name: string): Promise<void> {
    const dialog = this.dialog();
    await dialog.getByLabel('Name *', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  }

  async deleteSchool(email: string): Promise<void> {
    await gotoRowPage(this.page, this.row(email));
    await this.row(email).getByRole('button', { name: 'Delete', exact: true }).click();
    // v2 delete goes through a Mantine confirm modal (not window.confirm).
    await this.dialog().getByRole('button', { name: 'Delete', exact: true }).click();
  }
}
